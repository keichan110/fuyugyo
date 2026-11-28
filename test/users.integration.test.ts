import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userListSchema, userSchema } from '../src/features/users/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { instructors, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * User 管理（一覧・ロール変更・無効化・Instructor リンク）の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として検証する。
 */

const MESSAGING_TOKEN = 'test-messaging-access-token';
const MENU_ID = 'richmenu-instructor';
const ALIAS_URL = 'https://api.line.me/v2/bot/richmenu/alias/fuyugyo-instructor';

const { captureException } = vi.hoisted(() => {
  vi.resetModules();
  return { captureException: vi.fn() };
});

vi.mock('@sentry/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/cloudflare')>()),
  captureException,
}));

const fetchMock = vi.fn<typeof fetch>();

/** エイリアス照会にはメニュー ID を、その他の操作には空の成功応答を返す LINE の代役 */
async function fakeLine(input: Parameters<typeof fetch>[0]): Promise<Response> {
  return Response.json(String(input) === ALIAS_URL ? { richMenuId: MENU_ID } : {});
}

// 紐付けの操作は LINE API を呼ぶため、実際の LINE へは送らない
beforeEach(() => {
  fetchMock.mockImplementation(fakeLine);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function envWith(overrides: Partial<Env>): Env {
  return {
    ...(env as unknown as Env),
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: MESSAGING_TOKEN,
    ...overrides,
  };
}

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' } };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** seed: ADMIN ロールの User を1件作成し、JWT を発行して返す */
async function seedAdminToken(): Promise<{ token: string; userId: string }> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テスト管理者',
      role: 'ADMIN',
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedAdminToken: user insert failed');

  const token = await signJwt(
    {
      userId: user.id,
      displayName: user.displayName,
      role: 'ADMIN',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  return { token, userId: user.id };
}

/** seed: MANAGER ロールの User を1件作成し、JWT を発行して返す */
async function seedManagerToken(): Promise<{ token: string; userId: string }> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テストマネージャー',
      role: 'MANAGER',
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedManagerToken: user insert failed');

  const token = await signJwt(
    {
      userId: user.id,
      displayName: user.displayName,
      role: 'MANAGER',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  return { token, userId: user.id };
}

/** seed: User を1件作成して ID を返す（ロール省略時は MEMBER） */
async function seedUser(
  displayName = 'テストユーザー',
  role: 'MEMBER' | 'MANAGER' | 'ADMIN' = 'MEMBER',
): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName,
      role,
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedUser: insert failed');
  return user.id;
}

/** seed: Instructor を1件作成して ID を返す */
async function seedInstructor(lastName = '山田', firstName = '太郎'): Promise<string> {
  const db = createDb(env.DB);
  const [inst] = await db
    .insert(instructors)
    .values({ lastName, firstName, status: 'ACTIVE' })
    .returning();
  if (!inst) throw new Error('seedInstructor: insert failed');
  return inst.id;
}

/** 全 User（ロール・有効状態・Instructor 紐付け・更新日時を含む）。拒否された操作の前後比較に使う */
async function snapshotUsers() {
  return await createDb(env.DB).select().from(users).orderBy(users.id);
}

beforeEach(async () => {
  const db = createDb(env.DB);
  // 外部キー依存順に削除する
  await db.delete(users);
  await db.delete(instructors);
});

// ─── GET /api/users ──────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/users', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('MANAGER もユーザー一覧を取得できる', async () => {
    const { token } = await seedManagerToken();
    await seedUser('メンバー1');
    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    expect(userListSchema.parse(await res.json()).length).toBeGreaterThanOrEqual(2);
  });

  it('MEMBER は 403 で弾かれる', async () => {
    const userId = await seedUser('メンバー', 'MEMBER');
    const token = await signJwt(
      { userId, displayName: 'メンバー', role: 'MEMBER', isActive: true },
      env.JWT_SECRET,
      env.JWT_EXPIRES_IN,
    );
    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });

  it('ADMIN はユーザー一覧を取得できる', async () => {
    const { token } = await seedAdminToken();
    await seedUser('メンバー1');
    await seedUser('メンバー2');

    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const json: unknown = await res.json();
    const body = userListSchema.parse(json);
    // LINE ユーザー ID はログイン時の特定にのみ使うため、レスポンスに含めない
    expect(json).not.toContainEqual(expect.objectContaining({ lineUserId: expect.anything() }));
    // ADMIN 自身 + 追加した2名 = 3件
    expect(body.length).toBe(3);
  });
});

// ─── GET /api/users/:id ──────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  it('存在するユーザーを返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser('対象ユーザー');

    const res = await app.request(`/api/users/${userId}`, authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const json: unknown = await res.json();
    expect(json).not.toHaveProperty('lineUserId');
    const body = userSchema.parse(json);
    expect(body.id).toBe(userId);
    expect(body.displayName).toBe('対象ユーザー');
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request('/api/users/nonexistent-id', authHeader(token), envWith({}));
    expect(res.status).toBe(404);
  });

  it('MANAGER もユーザーを取得できる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser('対象ユーザー');

    const res = await app.request(`/api/users/${userId}`, authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).id).toBe(userId);
  });

  it('MEMBER は 403 で弾かれる', async () => {
    const memberId = await seedUser('メンバー', 'MEMBER');
    const targetId = await seedUser('対象ユーザー');
    const token = await signJwt(
      { userId: memberId, displayName: 'メンバー', role: 'MEMBER', isActive: true },
      env.JWT_SECRET,
      env.JWT_EXPIRES_IN,
    );
    const res = await app.request(`/api/users/${targetId}`, authHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/users/:id/change-role ─────────────────────────────────────────

describe('POST /api/users/:id/change-role', () => {
  it('ADMIN はロールを変更できる（MEMBER → MANAGER）', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'MANAGER' }) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const json: unknown = await res.json();
    expect(json).not.toHaveProperty('lineUserId');
    const body = userSchema.parse(json);
    expect(body.role).toBe('MANAGER');
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser();
    const before = await snapshotUsers();

    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'ADMIN' }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
    expect(await snapshotUsers()).toEqual(before);
  });

  it('不正なロール値は 400 を返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'SUPER_ADMIN' }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/change-role',
      { method: 'POST', ...authJsonRequest(token, { role: 'MANAGER' }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('自分自身のロール変更は 400 で弾かれる', async () => {
    const { token, userId } = await seedAdminToken();
    const before = await snapshotUsers();
    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'MEMBER' }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
    expect(await snapshotUsers()).toEqual(before);
  });
});

// ─── POST /api/users/:id/deactivate ──────────────────────────────────────────

describe('POST /api/users/:id/deactivate', () => {
  it('ADMIN はユーザーを無効化できる', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.isActive).toBe(false);
  });

  it('ADMIN は MANAGER / ADMIN（自分以外）も無効化できる', async () => {
    const { token } = await seedAdminToken();
    for (const role of ['MANAGER', 'ADMIN'] as const) {
      const userId = await seedUser(`対象-${role}`, role);
      const res = await app.request(
        `/api/users/${userId}/deactivate`,
        { method: 'POST', ...authHeader(token) },
        envWith({}),
      );
      expect(res.status).toBe(200);
      expect(userSchema.parse(await res.json()).isActive).toBe(false);
    }
  });

  it('MANAGER は MEMBER を無効化できる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).isActive).toBe(false);
  });

  it('MANAGER が MANAGER / ADMIN を無効化しようとすると 403', async () => {
    const { token } = await seedManagerToken();
    for (const role of ['MANAGER', 'ADMIN'] as const) {
      const userId = await seedUser(`対象-${role}`, role);
      const before = await snapshotUsers();
      const res = await app.request(
        `/api/users/${userId}/deactivate`,
        { method: 'POST', ...authHeader(token) },
        envWith({}),
      );
      expect(res.status).toBe(403);
      expect(await snapshotUsers()).toEqual(before);
    }
  });

  it('MANAGER の自己無効化は 400 で弾かれる', async () => {
    const { token, userId } = await seedManagerToken();
    const before = await snapshotUsers();
    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(400);
    expect(await snapshotUsers()).toEqual(before);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('自分自身の無効化は 400 で弾かれる', async () => {
    const { token, userId } = await seedAdminToken();
    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/users/:id/activate ────────────────────────────────────────────

describe('POST /api/users/:id/activate', () => {
  it('無効化済みユーザーをアクティブ化できる', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    // API 経由で無効化してからアクティブ化する
    await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );

    const res = await app.request(
      `/api/users/${userId}/activate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.isActive).toBe(true);
  });

  it('MANAGER は MEMBER をアクティブ化できる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser();
    await createDb(env.DB).update(users).set({ isActive: false }).where(eq(users.id, userId));

    const res = await app.request(
      `/api/users/${userId}/activate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).isActive).toBe(true);
  });

  it('MANAGER が MANAGER / ADMIN をアクティブ化しようとすると 403', async () => {
    const { token } = await seedManagerToken();
    for (const role of ['MANAGER', 'ADMIN'] as const) {
      const userId = await seedUser(`対象-${role}`, role);
      await createDb(env.DB).update(users).set({ isActive: false }).where(eq(users.id, userId));
      const before = await snapshotUsers();
      const res = await app.request(
        `/api/users/${userId}/activate`,
        { method: 'POST', ...authHeader(token) },
        envWith({}),
      );
      expect(res.status).toBe(403);
      expect(await snapshotUsers()).toEqual(before);
    }
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/activate',
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/users/:id/link-instructor ─────────────────────────────────────

describe('POST /api/users/:id/link-instructor', () => {
  it('ADMIN は User を Instructor にリンクできる', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();
    const instructorId = await seedInstructor();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.instructorId).toBe(instructorId);
  });

  it.each([
    ['instructorId がない', {}],
    ['instructorId が空文字', { instructorId: '' }],
    ['instructorId が文字列でない', { instructorId: 123 }],
  ])('本文不正（%s）は 400 で、User の紐付けを変えない', async (_name, body) => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();
    const linked = await seedInstructor('既存', '紐付け');
    await seedInstructor('別', '講師');
    await createDb(env.DB).update(users).set({ instructorId: linked }).where(eq(users.id, userId));
    const before = await snapshotUsers();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, body) },
      envWith({}),
    );

    expect(res.status).toBe(400);
    expect(await snapshotUsers()).toEqual(before);
  });

  it('1 Instructor に複数 User をリンクしようとすると 409（UNIQUE 制約違反）', async () => {
    const { token } = await seedAdminToken();
    const userId1 = await seedUser('ユーザーA');
    const userId2 = await seedUser('ユーザーB');
    const instructorId = await seedInstructor();

    // 最初のリンクは成功する
    const res1 = await app.request(
      `/api/users/${userId1}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res1.status).toBe(200);

    // 同じ Instructor に別の User をリンクしようとすると 409 になる
    const res2 = await app.request(
      `/api/users/${userId2}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res2.status).toBe(409);
  });

  it('リンクなしの User・Instructor が共存できる', async () => {
    const { token } = await seedAdminToken();
    // リンクなしの User を複数作成しても UNIQUE 制約に引っかからない（NULL は UNIQUE 対象外）
    await seedUser('リンクなしA');
    await seedUser('リンクなしB');
    await seedInstructor('未リンク', 'インストラクター');

    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const body = userListSchema.parse(await res.json());
    // ADMIN 自身 + 追加した2名 = 3件（全員 instructorId が null）
    expect(body.length).toBe(3);
    expect(body.every((u) => u.instructorId === null)).toBe(true);
  });

  it('存在しない User へのリンクは 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const instructorId = await seedInstructor();

    const res = await app.request(
      '/api/users/nonexistent-id/link-instructor',
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('存在しない Instructor へのリンクは 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId: 'nonexistent-instructor-id' }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('MANAGER は MEMBER をリンクできる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser();
    const instructorId = await seedInstructor();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).instructorId).toBe(instructorId);
  });

  it('MANAGER は自分自身もリンクできる', async () => {
    const { token, userId } = await seedManagerToken();
    const instructorId = await seedInstructor();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).instructorId).toBe(instructorId);
  });
});

// ─── DELETE /api/users/:id/link-instructor ────────────────────────────────────

describe('DELETE /api/users/:id/link-instructor', () => {
  it('ADMIN は Instructor リンクを解除できる', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();
    const instructorId = await seedInstructor();

    // まずリンクする
    await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({}),
    );

    // 解除する
    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.instructorId).toBeNull();
  });

  it('リンクされていない User の解除は 409 を返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(409);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/link-instructor',
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('MANAGER はリンクを解除できる', async () => {
    const { token } = await seedManagerToken();
    const userId = await seedUser();
    const instructorId = await seedInstructor();
    await createDb(env.DB).update(users).set({ instructorId }).where(eq(users.id, userId));

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(userSchema.parse(await res.json()).instructorId).toBeNull();
  });
});

// ─── Instructor リンクと LINE の個別リッチメニュー ────────────────────────────

describe('Instructor リンクに応じたリッチメニューの切り替え', () => {
  // URL セグメントのエンコードを確認できるよう、区切り文字を含む ID にする
  const LINE_USER_ID = 'U-private/target?id';
  const USER_MENU_URL = 'https://api.line.me/v2/bot/user/U-private%2Ftarget%3Fid/richmenu';

  async function seedTarget(values: { isActive?: boolean; instructorId?: string } = {}) {
    const [user] = await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: LINE_USER_ID, displayName: '対象', ...values })
      .returning();
    if (!user) throw new Error('seedTarget: insert failed');
    return user.id;
  }

  async function link(userId: string, instructorId: string, overrides: Partial<Env> = {}) {
    const { token } = await seedAdminToken();
    return app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith(overrides),
    );
  }

  async function unlink(userId: string, overrides: Partial<Env> = {}) {
    const { token } = await seedAdminToken();
    return app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith(overrides),
    );
  }

  async function findInstructorId(userId: string) {
    const [row] = await createDb(env.DB)
      .select({ instructorId: users.instructorId })
      .from(users)
      .where(eq(users.id, userId));
    return row?.instructorId;
  }

  /** 送った要求をメソッドと URL の組で返す */
  function sentRequests() {
    return fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);
  }

  /** 通知が一回だけで、固定の内容以外を含まないことを確認する */
  function expectNotification(tags: Record<string, unknown>) {
    expect(captureException.mock.calls).toEqual([[expect.any(Error), { tags }]]);
    const [error, context] = captureException.mock.calls[0] ?? [];
    expect(error).not.toHaveProperty('cause');
    const notified = `${String(error)} ${error instanceof Error ? error.stack : ''} ${JSON.stringify(context)}`;
    expect(notified).not.toMatch(/private|test-messaging|api\.line\.me|richmenu-instructor/);
  }

  it('有効な未紐付けユーザーを紐付けると、エイリアスのメニューを対象者へ割り当てる', async () => {
    const userId = await seedTarget();
    const instructorId = await seedInstructor();

    const res = await link(userId, instructorId);

    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).not.toHaveProperty('lineUserId');
    expect(userSchema.parse(json).instructorId).toBe(instructorId);
    expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`, `POST ${USER_MENU_URL}/${MENU_ID}`]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${MESSAGING_TOKEN}`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(captureException).not.toHaveBeenCalled();
  });

  it('付け替えでは D1 だけを更新し、LINE API を呼ばない', async () => {
    const userId = await seedTarget({ instructorId: await seedInstructor('旧', '講師') });
    const next = await seedInstructor('新', '講師');

    const res = await link(userId, next);

    expect(res.status).toBe(200);
    expect(await findInstructorId(userId)).toBe(next);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('無効なユーザーの紐付けでは LINE API を呼ばない', async () => {
    const userId = await seedTarget({ isActive: false });
    const instructorId = await seedInstructor();

    const res = await link(userId, instructorId);

    expect(res.status).toBe(200);
    expect(await findInstructorId(userId)).toBe(instructorId);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('紐付け済みの Instructor を指定した 409 では、紐付けも割り当てもしない', async () => {
    const instructorId = await seedInstructor();
    await createDb(env.DB)
      .update(users)
      .set({ instructorId })
      .where(eq(users.id, await seedUser('先約')));
    const userId = await seedTarget();

    const res = await link(userId, instructorId);

    expect(res.status).toBe(409);
    expect(await findInstructorId(userId)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('D1 の更新に失敗した場合は割り当てない', async () => {
    const userId = await seedTarget();
    const instructorId = await seedInstructor();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('D1 unavailable'));

    const res = await link(userId, instructorId);

    expect(res.status).toBe(500);
    expect(await findInstructorId(userId)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ instructorId: null }, { isActive: false }])(
    'エイリアス照会中に対象外（%j）になった場合は割り当てない',
    async (change) => {
      const userId = await seedTarget();
      fetchMock.mockImplementation(async (input) => {
        await createDb(env.DB).update(users).set(change).where(eq(users.id, userId));
        return fakeLine(input);
      });

      const res = await link(userId, await seedInstructor());

      expect(res.status).toBe(200);
      expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`]);
    },
  );

  it.each([true, false])(
    '解除すると対象者の個別メニューを削除する（有効: %s）',
    async (isActive) => {
      const userId = await seedTarget({ isActive, instructorId: await seedInstructor() });

      const res = await unlink(userId);

      expect(res.status).toBe(200);
      expect(await findInstructorId(userId)).toBeNull();
      expect(sentRequests()).toEqual([`DELETE ${USER_MENU_URL}`]);
      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it('未紐付けの解除は 409 で、LINE API を呼ばない', async () => {
    const res = await unlink(await seedTarget());

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const failed = () => Response.json({ message: 'private-error-body' }, { status: 500 });
  const networkError = () => {
    throw new Error('private-network-error');
  };

  it.each<[string, () => Response, Record<string, unknown>]>([
    ['非成功の応答', failed, { httpStatus: 500 }],
    ['通信の失敗', networkError, { failureKind: 'network_error' }],
    ['JSON でない応答', () => new Response('private-body'), { failureKind: 'invalid_response' }],
    [
      '形式が不正な応答',
      () => Response.json({ richMenuId: '' }),
      { failureKind: 'invalid_response' },
    ],
  ])('エイリアス照会の%sでも紐付けは成功し、固定の内容を通知する', async (_label, fail, tags) => {
    const userId = await seedTarget();
    const instructorId = await seedInstructor();
    fetchMock.mockImplementation(async () => fail());

    const res = await link(userId, instructorId);

    expect(res.status).toBe(200);
    expect(await findInstructorId(userId)).toBe(instructorId);
    expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`]);
    expectNotification({ endpoint: 'line.richmenu.alias.get', ...tags });
  });

  it.each<[string, () => Response, Record<string, unknown>]>([
    ['非成功の応答', failed, { httpStatus: 500 }],
    ['通信の失敗', networkError, { failureKind: 'network_error' }],
  ])('割り当ての%sでも紐付けは成功し、固定の内容を通知する', async (_label, fail, tags) => {
    const userId = await seedTarget();
    const instructorId = await seedInstructor();
    fetchMock.mockImplementation(async (input) =>
      String(input) === ALIAS_URL ? fakeLine(input) : fail(),
    );

    const res = await link(userId, instructorId);

    expect(res.status).toBe(200);
    expect(await findInstructorId(userId)).toBe(instructorId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNotification({ endpoint: 'line.richmenu.user.link', ...tags });
  });

  it.each<[string, () => Response, Record<string, unknown>]>([
    ['非成功の応答', failed, { httpStatus: 500 }],
    ['通信の失敗', networkError, { failureKind: 'network_error' }],
  ])('個別解除の%sでも解除は成功し、固定の内容を通知する', async (_label, fail, tags) => {
    const userId = await seedTarget({ instructorId: await seedInstructor() });
    fetchMock.mockImplementation(async () => fail());

    const res = await unlink(userId);

    expect(res.status).toBe(200);
    expect(await findInstructorId(userId)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectNotification({ endpoint: 'line.richmenu.user.unlink', ...tags });
  });

  it('5 秒のタイムアウトを超えた場合も紐付けは成功し、タイムアウトを通知する', async () => {
    const userId = await seedTarget();
    const instructorId = await seedInstructor();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    // 要求の送信後に中断し、応答が届かない状態を模す
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new Error('private-abort-error');
    });

    const res = await link(userId, instructorId);

    expect(res.status).toBe(200);
    expect(timeout.mock.calls).toEqual([[5000]]);
    expect(await findInstructorId(userId)).toBe(instructorId);
    expectNotification({ endpoint: 'line.richmenu.alias.get', failureKind: 'timeout' });
  });

  it.each([undefined, ''])(
    'アクセストークンが %j でも紐付けと解除は成功し、設定不備を通知する',
    async (accessToken) => {
      const userId = await seedTarget();
      const instructorId = await seedInstructor();
      const overrides: Partial<Env> = {};
      Object.assign(overrides, { LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: accessToken });

      expect((await link(userId, instructorId, overrides)).status).toBe(200);
      expectNotification({ endpoint: 'line.richmenu.user.link', failureKind: 'not_configured' });
      captureException.mockClear();

      expect((await unlink(userId, overrides)).status).toBe(200);
      expectNotification({ endpoint: 'line.richmenu.user.unlink', failureKind: 'not_configured' });
      expect(await findInstructorId(userId)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
