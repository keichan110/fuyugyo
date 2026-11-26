import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildNotificationInserts } from '../src/features/notifications/api';
import {
  notificationListResponseSchema,
  notificationReadResponseSchema,
  type NotificationInput,
} from '../src/features/notifications/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { notifications, shiftTypes, users } from '../src/server/db/schema';

async function seedUser(): Promise<string> {
  const [user] = await createDb(env.DB)
    .insert(users)
    .values({ lineUserId: `line-${crypto.randomUUID()}`, displayName: 'テスト利用者' })
    .returning();
  if (!user) throw new Error('ユーザー作成失敗');
  return user.id;
}

function notificationFor(
  userId: string,
  overrides: Partial<NotificationInput> = {},
): NotificationInput {
  return {
    userId,
    title: '件名',
    body: '本文',
    actionUrl: '/shifts',
    eventKey: 'event-1',
    ...overrides,
  };
}

async function runBatch(operations: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = operations;
  if (!first) throw new Error('batch が空です');
  await createDb(env.DB).batch([first, ...rest]);
}

async function save(...inputs: NotificationInput[]): Promise<void> {
  await runBatch(buildNotificationInserts(createDb(env.DB), inputs));
}

function selectNotifications() {
  return createDb(env.DB).select().from(notifications);
}

function selectShiftTypeNames() {
  return createDb(env.DB).select({ name: shiftTypes.name }).from(shiftTypes);
}

/** 順序を指定できる固定の通知 ID。`sequence` が大きいほど ID の順で後になる。 */
function notificationId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

/** 作成日時と ID を指定して通知を直接入れる。時刻の経過を待たずに同秒の通知を作る。 */
async function insertNotification(
  userId: string,
  sequence: number,
  overrides: Partial<typeof notifications.$inferInsert> = {},
): Promise<string> {
  const id = notificationId(sequence);
  await createDb(env.DB)
    .insert(notifications)
    .values({
      id,
      userId,
      title: `件名${sequence}`,
      body: `本文${sequence}`,
      eventKey: `event-${sequence}`,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      ...overrides,
    });
  return id;
}

async function requestAs(userId: string, path: string, method = 'GET'): Promise<Response> {
  const token = await signJwt(
    { userId, displayName: 'テスト利用者', role: 'MEMBER', isActive: true },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  return await app.request(
    path,
    { method, headers: { cookie: `auth-token=${token}`, 'sec-fetch-site': 'same-origin' } },
    env,
  );
}

async function listAs(userId: string, query: Record<string, string> = {}) {
  const response = await requestAs(
    userId,
    `/api/notifications/me?${new URLSearchParams(query).toString()}`,
  );
  expect(response.status).toBe(200);
  const page = notificationListResponseSchema.parse(await response.json());
  return { ...page, ids: page.items.map((item) => item.id) };
}

function markReadAs(userId: string, id: string): Promise<Response> {
  return requestAs(userId, `/api/notifications/${id}/read`, 'PUT');
}

/** nextCursor が null になるまで一覧をたどり、ページごとの通知 ID を返す。 */
async function listAllPages(userId: string, query: Record<string, string>): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof listAs>> = await listAs(
      userId,
      cursor === null ? query : { ...query, cursor },
    );
    pages.push(page.ids);
    cursor = page.nextCursor;
    // cursor が進まない不具合で終わらなくならないようにする
    expect(pages.length).toBeLessThanOrEqual(100);
  } while (cursor !== null);
  return pages;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(notifications);
  await db.delete(users);
  await db.delete(shiftTypes);
});

describe('通知の保存', () => {
  it('A2: 同じユーザー・同じ eventKey の再保存は保存済みの内容と日時を変えない', async () => {
    const userId = await seedUser();
    await save(notificationFor(userId));
    // 再保存で上書きされれば必ず差が出るよう、作成日時と既読日時を過去の値にする
    await createDb(env.DB)
      .update(notifications)
      .set({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        readAt: new Date('2026-01-02T00:00:00Z'),
      });
    const saved = await selectNotifications();

    await save(
      notificationFor(userId, { title: '別の件名', body: '別の本文', actionUrl: '/other' }),
    );

    expect(saved).toHaveLength(1);
    expect(await selectNotifications()).toEqual(saved);
  });

  it('A2: 同じ batch 内の重複も先頭の1件だけを保存する', async () => {
    const userId = await seedUser();

    await save(notificationFor(userId), notificationFor(userId, { title: '後の件名' }));

    expect(await selectNotifications()).toMatchObject([{ userId, title: '件名' }]);
  });

  it('A3: 別の eventKey は別の通知になり、同じ eventKey でもユーザーごとに保存する', async () => {
    const first = await seedUser();
    const second = await seedUser();

    await save(
      notificationFor(first),
      notificationFor(first, { eventKey: 'event-2' }),
      notificationFor(second),
    );

    const rows = await selectNotifications();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => `${row.userId}:${row.eventKey}`).sort()).toEqual(
      [`${first}:event-1`, `${first}:event-2`, `${second}:event-1`].sort(),
    );
  });

  it('渡した値を整形せず保存し、作成日時を入れて未読にする', async () => {
    const userId = await seedUser();
    const input = notificationFor(userId, { title: ' 件名 ', body: '1行目\n2行目\n' });

    await save(input);

    expect(await selectNotifications()).toMatchObject([
      { ...input, createdAt: expect.any(Date), readAt: null },
    ]);
  });

  it('通知がなければ INSERT を組み立てない', () => {
    expect(buildNotificationInserts(createDb(env.DB), [])).toEqual([]);
  });
});

describe('業務更新と同じ batch', () => {
  it('A4: 業務更新と通知の両方を保存する', async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();

    await runBatch([
      db.insert(shiftTypes).values({ name: '業務更新' }),
      ...buildNotificationInserts(db, [notificationFor(userId)]),
    ]);

    expect(await selectShiftTypeNames()).toEqual([{ name: '業務更新' }]);
    expect(await selectNotifications()).toHaveLength(1);
  });

  it('A4: 宛先が存在しない通知は失敗し、業務更新も残さない', async () => {
    const db = createDb(env.DB);

    await expect(
      runBatch([
        db.insert(shiftTypes).values({ name: '業務更新' }),
        ...buildNotificationInserts(db, [notificationFor(crypto.randomUUID())]),
      ]),
    ).rejects.toThrow('FOREIGN KEY constraint failed');

    expect(await selectShiftTypeNames()).toEqual([]);
    expect(await selectNotifications()).toEqual([]);
  });

  it('A4: 後の業務更新が失敗したら、先に置いた通知も残さない', async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    await db.insert(shiftTypes).values({ id: 'existing', name: '登録済み' });

    await expect(
      runBatch([
        ...buildNotificationInserts(db, [notificationFor(userId)]),
        db.insert(shiftTypes).values({ id: 'existing', name: '主キー重複' }),
      ]),
    ).rejects.toThrow('UNIQUE constraint failed');

    expect(await selectNotifications()).toEqual([]);
    expect(await selectShiftTypeNames()).toEqual([{ name: '登録済み' }]);
  });

  it('A4: 重複で通知が抑止されても業務更新は確定する', async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    await save(notificationFor(userId));

    await runBatch([
      ...buildNotificationInserts(db, [notificationFor(userId)]),
      db.insert(shiftTypes).values({ name: '業務更新' }),
    ]);

    expect(await selectShiftTypeNames()).toEqual([{ name: '業務更新' }]);
    expect(await selectNotifications()).toHaveLength(1);
  });
});

describe('通知の入力', () => {
  it.each(['/', '/shifts', '/shifts?x=1#y', '/シフト'])(
    'A5: アプリ内パス %j を保存する',
    async (actionUrl) => {
      const userId = await seedUser();

      await save(notificationFor(userId, { actionUrl }));

      expect(await selectNotifications()).toMatchObject([{ actionUrl }]);
    },
  );

  it.each([null, undefined])('A5: actionUrl が %s なら null で保存する', async (actionUrl) => {
    const userId = await seedUser();

    await save(notificationFor(userId, { actionUrl }));

    expect(await selectNotifications()).toMatchObject([{ actionUrl: null }]);
  });

  it.each([
    '',
    'shifts',
    'https://example.com/shifts',
    'javascript:alert(1)',
    '//example.com',
    '/\\example.com',
    '/shifts\\edit',
    ' /shifts',
    '/shifts ',
    '/a b',
    '/\t/example.com',
    '/\n/example.com',
    '/\r/example.com',
    '/a b',
    '/a b',
    '/a　b',
    '/a\u0000b',
    '/a\u001fb',
    '/a\u007fb',
    '/a\u0085b',
    '/a\u009fb',
  ])('A5: actionUrl %j は保存前に例外にする', async (actionUrl) => {
    const userId = await seedUser();

    expect(() =>
      buildNotificationInserts(createDb(env.DB), [notificationFor(userId, { actionUrl })]),
    ).toThrow(z.ZodError);
    expect(await selectNotifications()).toEqual([]);
  });

  describe.each(['title', 'body', 'eventKey'] as const)('%s', (field) => {
    it.each(['', ' ', '\t\n', ' 　'])(`A5: ${field} が %j なら保存前に例外にする`, (value) => {
      expect(() =>
        buildNotificationInserts(createDb(env.DB), [notificationFor('user', { [field]: value })]),
      ).toThrow(z.ZodError);
    });
  });

  it('A5: 1件でも不正なら、他の通知の INSERT も組み立てない', () => {
    expect(() =>
      buildNotificationInserts(createDb(env.DB), [
        notificationFor('user'),
        notificationFor('user', { eventKey: ' ' }),
      ]),
    ).toThrow(z.ZodError);
  });
});

describe('ユーザーの削除と無効化', () => {
  it('A6: ユーザー行を削除すると、そのユーザーの通知だけが消える', async () => {
    const removed = await seedUser();
    const remaining = await seedUser();
    await save(
      notificationFor(removed),
      notificationFor(removed, { eventKey: 'event-2' }),
      notificationFor(remaining),
    );

    await createDb(env.DB).delete(users).where(eq(users.id, removed));

    expect(await selectNotifications()).toMatchObject([{ userId: remaining }]);
  });

  it('A6: ユーザーを無効化しても通知は消えない', async () => {
    const userId = await seedUser();
    await save(notificationFor(userId));
    const saved = await selectNotifications();

    await createDb(env.DB).update(users).set({ isActive: false }).where(eq(users.id, userId));

    expect(await selectNotifications()).toEqual(saved);
  });
});

describe('GET /api/notifications/me', () => {
  it('A7: 本人の通知だけを作成日時・ID の降順で、公開する項目に限って返す', async () => {
    const userId = await seedUser();
    const other = await seedUser();
    // ID の順と作成日時の順が食い違うように入れ、並びの優先順位を区別する
    await insertNotification(userId, 3, { createdAt: new Date('2026-11-01T00:00:00Z') });
    await insertNotification(userId, 1, {
      createdAt: new Date('2026-11-02T00:00:00Z'),
      actionUrl: '/shifts',
      readAt: new Date('2026-11-03T00:00:00Z'),
    });
    await insertNotification(userId, 2, { createdAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(other, 4, { createdAt: new Date('2026-11-04T00:00:00Z') });

    const response = await requestAs(userId, '/api/notifications/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          id: notificationId(2),
          title: '件名2',
          body: '本文2',
          actionUrl: null,
          createdAt: '2026-11-02T00:00:00.000Z',
          readAt: null,
        },
        {
          id: notificationId(1),
          title: '件名1',
          body: '本文1',
          actionUrl: '/shifts',
          createdAt: '2026-11-02T00:00:00.000Z',
          readAt: '2026-11-03T00:00:00.000Z',
        },
        {
          id: notificationId(3),
          title: '件名3',
          body: '本文3',
          actionUrl: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          readAt: null,
        },
      ],
      nextCursor: null,
      unreadCount: 2,
    });
  });

  it('A7: 通知がなければ空の一覧を返す', async () => {
    const userId = await seedUser();

    expect(await listAs(userId)).toMatchObject({ items: [], nextCursor: null, unreadCount: 0 });
  });

  it('A7: 保存ヘルパーで保存した通知を一覧で返し、その cursor で続きをたどれる', async () => {
    const userId = await seedUser();
    await save(notificationFor(userId), notificationFor(userId, { eventKey: 'event-2' }));

    const pages = await listAllPages(userId, { limit: '1' });

    expect(pages.map((ids) => ids.length)).toEqual([1, 1]);
    expect(new Set(pages.flat()).size).toBe(2);
  });

  it.each([1, 2, 3, 6, 7])(
    'A8: 同秒の通知を含む一覧を limit=%i で欠落・重複なくたどれる',
    async (limit) => {
      const userId = await seedUser();
      const older = new Date('2026-10-31T23:59:59Z');
      const newer = new Date('2026-11-01T00:00:01Z');
      await insertNotification(userId, 9, { createdAt: older });
      for (const sequence of [3, 5, 2, 4]) await insertNotification(userId, sequence);
      await insertNotification(userId, 1, { createdAt: newer });
      const expected = [1, 5, 4, 3, 2, 9].map(notificationId);

      const pages = await listAllPages(userId, { limit: String(limit) });

      expect(pages.flat()).toEqual(expected);
      expect(pages).toHaveLength(Math.ceil(expected.length / limit));
    },
  );

  it.each([
    [{}, 20],
    [{ limit: '1' }, 1],
    [{ limit: '50' }, 50],
  ])('A8: クエリ %j では %i 件を返す', async (query: Record<string, string>, expected) => {
    const userId = await seedUser();
    for (let sequence = 1; sequence <= 51; sequence += 1) {
      await insertNotification(userId, sequence);
    }

    const page = await listAs(userId, query);

    expect(page.items).toHaveLength(expected);
    expect(page.nextCursor).not.toBeNull();
  });

  it('A8: 途中の追加・既読化は、次のページを読んだ時点の状態で反映する', async () => {
    const userId = await seedUser();
    for (const sequence of [1, 2, 3, 4]) await insertNotification(userId, sequence);
    const first = await listAs(userId, { limit: '2' });
    expect(first.ids).toEqual([4, 3].map(notificationId));
    await insertNotification(userId, 5, { createdAt: new Date('2026-11-02T00:00:00Z') });
    expect((await markReadAs(userId, notificationId(2))).status).toBe(200);

    const second = await listAs(userId, { limit: '2', cursor: first.nextCursor ?? '' });

    expect(second.ids).toEqual([2, 1].map(notificationId));
    expect(second.items[0]?.readAt).not.toBeNull();
    expect(second.nextCursor).toBeNull();
    expect(second.unreadCount).toBe(4);
  });

  it('A9: unreadOnly=true は未読だけを返し、false は既読も返す', async () => {
    const userId = await seedUser();
    await insertNotification(userId, 1);
    await insertNotification(userId, 2, { readAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(userId, 3);

    expect((await listAs(userId, { unreadOnly: 'true' })).ids).toEqual([3, 1].map(notificationId));
    expect((await listAs(userId, { unreadOnly: 'false' })).ids).toEqual(
      [3, 2, 1].map(notificationId),
    );
  });

  it('A9: 未読だけの一覧は、読んだ末尾の通知を既読にしても続きをたどれる', async () => {
    const userId = await seedUser();
    for (const sequence of [1, 2, 3]) await insertNotification(userId, sequence);
    const first = await listAs(userId, { unreadOnly: 'true', limit: '1' });
    expect((await markReadAs(userId, notificationId(3))).status).toBe(200);

    const rest = await listAs(userId, { unreadOnly: 'true', cursor: first.nextCursor ?? '' });

    expect(rest.ids).toEqual([2, 1].map(notificationId));
  });

  it('A9: unreadCount は limit・cursor・unreadOnly によらず本人の未読総数になる', async () => {
    const userId = await seedUser();
    const other = await seedUser();
    for (const sequence of [1, 2, 3]) await insertNotification(userId, sequence);
    await insertNotification(userId, 4, { readAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(other, 5);

    for (const unreadOnly of ['true', 'false']) {
      const first = await listAs(userId, { unreadOnly, limit: '1' });
      const next = await listAs(userId, {
        unreadOnly,
        limit: '1',
        cursor: first.nextCursor ?? '',
      });
      const last = await listAs(userId, { unreadOnly, cursor: `0_${notificationId(1)}` });

      expect(last.items).toEqual([]);
      expect([first.unreadCount, next.unreadCount, last.unreadCount]).toEqual([3, 3, 3]);
    }
  });

  it.each([
    'limit=0',
    'limit=51',
    'limit=1.5',
    'limit=-1',
    'limit=1e1',
    'limit=abc',
    'limit=',
    'limit=1&limit=2',
    'cursor=',
    'cursor=abc',
    'cursor=1793491200',
    'cursor=1793491200_',
    'cursor=1793491200_abc',
    `cursor=_${notificationId(1)}`,
    `cursor=abc_${notificationId(1)}`,
    `cursor=1.5_${notificationId(1)}`,
    `cursor=12345678901_${notificationId(1)}`,
    `cursor=1793491200_${notificationId(1)}_x`,
    'unreadOnly=1',
    'unreadOnly=TRUE',
    'unreadOnly=',
  ])('A10: 不正なクエリ %s は 400', async (query) => {
    const userId = await seedUser();

    const response = await requestAs(userId, `/api/notifications/me?${query}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.any(String) });
  });
});

describe('PUT /api/notifications/:id/read', () => {
  it('A11: 未読の通知を既読にして {id,readAt} を返す', async () => {
    const userId = await seedUser();
    const id = await insertNotification(userId, 1);
    await insertNotification(userId, 2);
    const startedAt = Math.floor(Date.now() / 1000) * 1000;

    const response = await markReadAs(userId, id);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const { readAt } = notificationReadResponseSchema.parse(body);
    expect(body).toEqual({ id, readAt });
    expect(Date.parse(readAt)).toBeGreaterThanOrEqual(startedAt);
    expect(Date.parse(readAt)).toBeLessThanOrEqual(Date.now());
    const page = await listAs(userId);
    expect(page.items.map((item) => item.readAt)).toEqual([null, readAt]);
    expect(page.unreadCount).toBe(1);
  });

  it('A11: 既読済みの通知は 200 で、初回の readAt を保つ', async () => {
    const userId = await seedUser();
    // 再実行で上書きされれば必ず差が出るよう、初回の既読日時を過去の値にする
    const id = await insertNotification(userId, 1, {
      readAt: new Date('2026-01-02T00:00:00Z'),
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await markReadAs(userId, id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id, readAt: '2026-01-02T00:00:00.000Z' });
    }
  });

  it('A12: 他人の通知と存在しない ID は同じ 404 になり、他人の通知は未読のまま', async () => {
    const userId = await seedUser();
    const other = await seedUser();
    const othersId = await insertNotification(other, 1);
    const saved = await selectNotifications();

    const forOthers = await markReadAs(userId, othersId);
    const forMissing = await markReadAs(userId, notificationId(999));

    expect([forOthers.status, forMissing.status]).toEqual([404, 404]);
    const body = await forOthers.text();
    expect(JSON.parse(body)).toEqual({ message: 'Notification not found' });
    expect(await forMissing.text()).toBe(body);
    expect(await selectNotifications()).toEqual(saved);
  });
});
