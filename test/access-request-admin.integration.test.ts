import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approveAccessRequestResponseSchema,
  pendingAccessRequestListSchema,
  rejectBatchResponseSchema,
} from '../src/features/access-requests/schema';
import app from '../src/index';
import { signAccessRequestToken } from '../src/server/auth/access-request-token';
import { signJwt, verifyJwt, type UserRole } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { accessRequests, instructors, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';
import { interruptBeforeBatch } from './d1-interrupt';

/**
 * 利用申請の管理 API（一覧・承認・却下・一括却下）の統合テスト（実 D1）。
 * 権限・期限・公開列・承認の原子性・競合時の申請保持・承認後ログイン・却下後再申請を検証する。
 */

const DAY = 24 * 60 * 60 * 1000;
const LINE_USER = 'line-applicant';

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    ACCESS_REQUESTS_ENABLED: 'true',
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

/** 指定ロールの User を作成し、そのセッション JWT を返す */
async function seedActor(role: UserRole) {
  const [user] = await createDb(env.DB)
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: role,
      role,
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedActor: insert failed');
  return await signJwt(
    { userId: user.id, displayName: user.displayName, role, isActive: true },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

function request(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  reqEnv = envWith(),
) {
  return app.request(
    `/api/access-requests${path}`,
    {
      method,
      headers: {
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        ...(token ? { cookie: `auth-token=${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    reqEnv,
  );
}

async function seedRequest(
  overrides: Partial<typeof accessRequests.$inferInsert> = {},
): Promise<typeof accessRequests.$inferSelect> {
  const [row] = await createDb(env.DB)
    .insert(accessRequests)
    .values({
      id: crypto.randomUUID(),
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: '申請者',
      requestedAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedRequest: insert failed');
  return row;
}

async function seedInstructor(): Promise<string> {
  const [row] = await createDb(env.DB)
    .insert(instructors)
    .values({ lastName: '山田', firstName: '太郎' })
    .returning({ id: instructors.id });
  if (!row) throw new Error('seedInstructor: insert failed');
  return row.id;
}

async function requestIds() {
  const rows = await createDb(env.DB).select({ id: accessRequests.id }).from(accessRequests);
  return rows.map((r) => r.id).sort();
}

async function usersOf(lineUserId: string) {
  return await createDb(env.DB).select().from(users).where(eq(users.lineUserId, lineUserId));
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(accessRequests);
  await db.delete(users);
  await db.delete(instructors);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('認可', () => {
  /** 全管理操作。`:id` と `ids` は対象の申請 ID に置き換えて呼ぶ */
  const operations: Array<{ method: string; path: string; body?: unknown }> = [
    { method: 'GET', path: '' },
    { method: 'POST', path: '/:id/approve', body: {} },
    { method: 'DELETE', path: '/:id' },
    { method: 'POST', path: '/reject-batch', body: { ids: [':id'] } },
  ];

  /** 操作内のプレースホルダを実際の申請 ID に置換して呼び出す */
  function callOperation(token: string | null, op: (typeof operations)[number], id: string) {
    const body =
      op.body === undefined ? undefined : JSON.parse(JSON.stringify(op.body).replace(':id', id));
    return request(token, op.method, op.path.replace(':id', id), body);
  }

  it.each(operations)('未認証の $method $path は401', async (op) => {
    expect((await callOperation(null, op, 'some-id')).status).toBe(401);
  });

  it.each(['MANAGER', 'MEMBER'] as const)(
    '%s は全管理操作が403で申請を変更しない',
    async (role) => {
      const target = await seedRequest();
      const token = await seedActor(role);

      for (const op of operations) {
        expect((await callOperation(token, op, target.id)).status).toBe(403);
      }
      expect(await requestIds()).toEqual([target.id]);
      expect(await usersOf(target.lineUserId)).toHaveLength(0);
    },
  );

  it('受付フラグが停止中・Rate Limit 超過でも ADMIN は管理操作できる', async () => {
    const token = await seedActor('ADMIN');
    await seedRequest();
    const closed = envWith({
      ACCESS_REQUESTS_ENABLED: 'false',
      AUTH_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });

    expect((await request(token, 'GET', '', undefined, closed)).status).toBe(200);
  });
});

describe('GET /api/access-requests', () => {
  it('期限内かつ未登録の申請だけを新しい順に返し、LINE ID を含めない', async () => {
    const token = await seedActor('ADMIN');
    const older = await seedRequest({
      displayName: '古い',
      requestedAt: new Date(Date.now() - 3 * DAY),
      country: 'JP',
      region: 'Hokkaido',
      city: 'Sapporo',
      pictureUrl: 'https://example.com/p.png',
    });
    const newer = await seedRequest({
      displayName: '新しい',
      requestedAt: new Date(Date.now() - DAY),
    });
    await seedRequest({ requestedAt: new Date(Date.now() - 7 * DAY - 60_000) });
    const registered = await seedRequest({ lineUserId: 'already-registered' });
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: registered.lineUserId, displayName: '登録済み' });

    const res = await request(token, 'GET', '');

    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    const list = pendingAccessRequestListSchema.parse(json);
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(list[1]).toMatchObject({
      displayName: '古い',
      pictureUrl: 'https://example.com/p.png',
      country: 'JP',
      region: 'Hokkaido',
      city: 'Sapporo',
    });
    expect(JSON.stringify(json)).not.toContain('lineUserId');
    expect(JSON.stringify(json)).not.toContain('line-');
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(
      ['city', 'country', 'displayName', 'id', 'pictureUrl', 'region', 'requestedAt'].sort(),
    );
  });

  it('7日ちょうどの境界は含め、1秒過ぎたものは含めない', async () => {
    const token = await seedActor('ADMIN');
    vi.useFakeTimers({ toFake: ['Date'] });
    // 発行済みトークンの有効期間内に収めるため、現在時刻（秒単位）を基準に固定する
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    vi.setSystemTime(now);
    const edge = await seedRequest({ requestedAt: new Date(now.getTime() - 7 * DAY) });
    await seedRequest({ requestedAt: new Date(now.getTime() - 7 * DAY - 1000) });

    const list = pendingAccessRequestListSchema.parse(
      await (await request(token, 'GET', '')).json(),
    );

    expect(list.map((r) => r.id)).toEqual([edge.id]);
  });
});

describe('POST /api/access-requests/:id/approve', () => {
  it('インストラクターなしで承認すると有効な MEMBER が作られ、申請が削除される', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({
      lineUserId: LINE_USER,
      pictureUrl: 'https://example.com/a.png',
    });

    const res = await request(token, 'POST', `/${target.id}/approve`, {});

    expect(res.status).toBe(201);
    const json: unknown = await res.json();
    const body = approveAccessRequestResponseSchema.parse(json);
    expect(JSON.stringify(json)).not.toContain(LINE_USER);
    const [created] = await usersOf(LINE_USER);
    expect(created).toMatchObject({
      id: body.id,
      role: 'MEMBER',
      isActive: true,
      displayName: '申請者',
      pictureUrl: 'https://example.com/a.png',
      instructorId: null,
    });
    expect(await requestIds()).toEqual([]);
  });

  it('インストラクター付きで承認すると同時に紐付く', async () => {
    const token = await seedActor('ADMIN');
    const instructorId = await seedInstructor();
    const target = await seedRequest({ lineUserId: LINE_USER });

    const res = await request(token, 'POST', `/${target.id}/approve`, { instructorId });

    expect(res.status).toBe(201);
    expect((await usersOf(LINE_USER))[0]).toMatchObject({ role: 'MEMBER', instructorId });
    expect(await requestIds()).toEqual([]);
  });

  it('承認後の次回 LINE ログインで MEMBER としてログインできる', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });
    await request(token, 'POST', `/${target.id}/approve`, {});

    const reqEnv = envWith();
    const login = await app.request('/api/auth/line/login?redirect=/shifts', {}, reqEnv);
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const cookie = (login.headers.get('set-cookie') ?? '')
      .split(/,\s(?=[\w-]+=)/)
      .map((c) => c.split(';')[0])
      .join('; ');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'line-access-token' }))
      .mockResolvedValueOnce(Response.json({ userId: LINE_USER, displayName: '申請者' }));
    const res = await app.request(
      `/api/auth/line/callback?code=code&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
      reqEnv,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${env.APP_URL}/shifts`);
    const authCookie = (res.headers.get('set-cookie') ?? '')
      .split(/,\s(?=[\w-]+=)/)
      .find((c) => c.startsWith('auth-token='));
    const jwt = authCookie?.split(';')[0]?.slice('auth-token='.length) ?? '';
    const verified = await verifyJwt(jwt, env.JWT_SECRET);
    expect(verified.success && verified.payload.role).toBe('MEMBER');
  });

  it('存在しない申請と期限切れの申請は404でユーザーを作らない', async () => {
    const token = await seedActor('ADMIN');
    const expired = await seedRequest({
      lineUserId: LINE_USER,
      requestedAt: new Date(Date.now() - 7 * DAY - 60_000),
    });

    expect((await request(token, 'POST', '/missing/approve', {})).status).toBe(404);
    expect((await request(token, 'POST', `/${expired.id}/approve`, {})).status).toBe(404);
    expect(await usersOf(LINE_USER)).toHaveLength(0);
    expect(await requestIds()).toEqual([expired.id]);
  });

  it('存在しないインストラクターは404で申請を保持する', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });

    const res = await request(token, 'POST', `/${target.id}/approve`, { instructorId: 'missing' });

    expect(res.status).toBe(404);
    expect(await usersOf(LINE_USER)).toHaveLength(0);
    expect(await requestIds()).toEqual([target.id]);
  });

  it('不正な入力は400', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest();

    expect(
      (await request(token, 'POST', `/${target.id}/approve`, { instructorId: 1 })).status,
    ).toBe(400);
    expect(
      (await request(token, 'POST', `/${target.id}/approve`, { instructorId: '' })).status,
    ).toBe(400);
    expect(await requestIds()).toEqual([target.id]);
  });

  it('既に登録済みの LINE ID は409で、既存ユーザーのロールと紐付けを上書きしない', async () => {
    const token = await seedActor('ADMIN');
    const instructorId = await seedInstructor();
    const other = await seedInstructor();
    const target = await seedRequest({ lineUserId: LINE_USER });
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: LINE_USER, displayName: '既存', role: 'MANAGER', instructorId: other });

    const res = await request(token, 'POST', `/${target.id}/approve`, { instructorId });

    expect(res.status).toBe(409);
    const existing = await usersOf(LINE_USER);
    expect(existing).toHaveLength(1);
    expect(existing[0]).toMatchObject({
      role: 'MANAGER',
      instructorId: other,
      displayName: '既存',
    });
  });

  it('既に別ユーザーが紐付いたインストラクターは409で、申請を保持する', async () => {
    const token = await seedActor('ADMIN');
    const instructorId = await seedInstructor();
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: 'line-linked', displayName: '紐付け済み', instructorId });
    const target = await seedRequest({ lineUserId: LINE_USER });

    const res = await request(token, 'POST', `/${target.id}/approve`, { instructorId });

    expect(res.status).toBe(409);
    expect(await usersOf(LINE_USER)).toHaveLength(0);
    expect(await requestIds()).toEqual([target.id]);
  });

  it('二重承認の2回目は404で、ユーザーは1件のまま', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });

    expect((await request(token, 'POST', `/${target.id}/approve`, {})).status).toBe(201);
    expect((await request(token, 'POST', `/${target.id}/approve`, {})).status).toBe(404);
    expect(await usersOf(LINE_USER)).toHaveLength(1);
  });

  it('承認の書き込み直前に同じ LINE ID のユーザーが作られると409で、そのユーザーを変更しない', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });
    const interruption = interruptBeforeBatch(env.DB, async () => {
      await createDb(env.DB)
        .insert(users)
        .values({ lineUserId: LINE_USER, displayName: '先行', role: 'MANAGER' });
    });

    const res = await request(
      token,
      'POST',
      `/${target.id}/approve`,
      {},
      envWith({ DB: interruption.db }),
    );

    expect(interruption.interruptCount()).toBe(1);
    expect(res.status).toBe(409);
    const existing = await usersOf(LINE_USER);
    expect(existing).toHaveLength(1);
    expect(existing[0]).toMatchObject({ role: 'MANAGER', displayName: '先行' });
  });

  it('承認の書き込み直前に却下されると404で、ユーザーを作らない', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });
    const interruption = interruptBeforeBatch(env.DB, async () => {
      await createDb(env.DB).delete(accessRequests).where(eq(accessRequests.id, target.id));
    });

    const res = await request(
      token,
      'POST',
      `/${target.id}/approve`,
      {},
      envWith({ DB: interruption.db }),
    );

    expect(res.status).toBe(404);
    expect(await usersOf(LINE_USER)).toHaveLength(0);
  });
});

describe('DELETE /api/access-requests/:id', () => {
  it('申請だけを削除して204を返し、他の申請は残る', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest();
    const other = await seedRequest();

    const res = await request(token, 'DELETE', `/${target.id}`);

    expect(res.status).toBe(204);
    expect(await requestIds()).toEqual([other.id]);
    expect(await usersOf(target.lineUserId)).toHaveLength(0);
  });

  it('存在しない申請は404', async () => {
    const token = await seedActor('ADMIN');
    expect((await request(token, 'DELETE', '/missing')).status).toBe(404);
  });

  it('却下後は同じ LINE アカウントが再申請できる', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest({ lineUserId: LINE_USER });
    await request(token, 'DELETE', `/${target.id}`);

    const flow = 'flow-reapply';
    const applicant = await signAccessRequestToken(
      { userId: LINE_USER, displayName: '再申請', flow },
      env.JWT_SECRET,
    );
    const res = await app.request(
      '/api/access-requests',
      {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'same-origin',
          cookie: `access-request=${applicant}; access-request-flow=${flow}`,
        },
      },
      envWith(),
    );

    expect(res.status).toBe(201);
    const rows = await createDb(env.DB)
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.lineUserId, LINE_USER));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(target.id);
  });
});

describe('POST /api/access-requests/reject-batch', () => {
  it('重複を排除して指定した申請だけを削除し、件数を返す', async () => {
    const token = await seedActor('ADMIN');
    const a = await seedRequest();
    const b = await seedRequest();
    const keep = await seedRequest();

    const res = await request(token, 'POST', '/reject-batch', {
      ids: [a.id, b.id, a.id, 'gone'],
    });

    expect(res.status).toBe(200);
    expect(rejectBatchResponseSchema.parse(await res.json())).toEqual({ deletedCount: 2 });
    expect(await requestIds()).toEqual([keep.id]);
  });

  it('0件・21件・不正な型は400で何も削除しない', async () => {
    const token = await seedActor('ADMIN');
    const target = await seedRequest();
    const ids = Array.from({ length: 21 }, (_, i) => `id-${i}`);

    expect((await request(token, 'POST', '/reject-batch', { ids: [] })).status).toBe(400);
    expect((await request(token, 'POST', '/reject-batch', { ids })).status).toBe(400);
    expect((await request(token, 'POST', '/reject-batch', { ids: [1] })).status).toBe(400);
    expect((await request(token, 'POST', '/reject-batch', {})).status).toBe(400);
    expect(await requestIds()).toEqual([target.id]);
  });

  it('20件ちょうどは受け付ける', async () => {
    const token = await seedActor('ADMIN');
    const rows = await Promise.all(Array.from({ length: 20 }, () => seedRequest()));

    const res = await request(token, 'POST', '/reject-batch', { ids: rows.map((r) => r.id) });

    expect(rejectBatchResponseSchema.parse(await res.json())).toEqual({ deletedCount: 20 });
  });
});
