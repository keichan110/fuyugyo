import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildNotificationInserts } from '../src/features/notifications/api';
import type { NotificationInput } from '../src/features/notifications/schema';
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
