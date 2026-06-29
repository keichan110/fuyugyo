import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
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

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
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
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: 'ADMIN',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );
  return { token, userId: user.id };
}

/** seed: MANAGER ロールの User を1件作成し、JWT を発行して返す */
async function seedManagerToken(): Promise<string> {
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

  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: 'MANAGER',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );
}

/** seed: 通常 User（MEMBER）を1件作成して ID を返す */
async function seedUser(displayName = 'テストユーザー'): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName,
      role: 'MEMBER',
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

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });

  it('ADMIN はユーザー一覧を取得できる', async () => {
    const { token } = await seedAdminToken();
    await seedUser('メンバー1');
    await seedUser('メンバー2');

    const res = await app.request('/api/users', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const body = userListSchema.parse(await res.json());
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

    const body = userSchema.parse(await res.json());
    expect(body.id).toBe(userId);
    expect(body.displayName).toBe('対象ユーザー');
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request('/api/users/nonexistent-id', authHeader(token), envWith({}));
    expect(res.status).toBe(404);
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
      envWith({})
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.role).toBe('MANAGER');
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'ADMIN' }) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });

  it('不正なロール値は 400 を返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'SUPER_ADMIN' }) },
      envWith({})
    );
    expect(res.status).toBe(400);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/change-role',
      { method: 'POST', ...authJsonRequest(token, { role: 'MANAGER' }) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('自分自身のロール変更は 400 で弾かれる', async () => {
    const { token, userId } = await seedAdminToken();
    const res = await app.request(
      `/api/users/${userId}/change-role`,
      { method: 'POST', ...authJsonRequest(token, { role: 'MEMBER' }) },
      envWith({})
    );
    expect(res.status).toBe(400);
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
      envWith({})
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.isActive).toBe(false);
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('自分自身の無効化は 400 で弾かれる', async () => {
    const { token, userId } = await seedAdminToken();
    const res = await app.request(
      `/api/users/${userId}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
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
      envWith({})
    );

    const res = await app.request(
      `/api/users/${userId}/activate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.isActive).toBe(true);
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/activate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/activate',
      { method: 'POST', ...authHeader(token) },
      envWith({})
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
      envWith({})
    );
    expect(res.status).toBe(200);

    const body = userSchema.parse(await res.json());
    expect(body.instructorId).toBe(instructorId);
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
      envWith({})
    );
    expect(res1.status).toBe(200);

    // 同じ Instructor に別の User をリンクしようとすると 409 になる
    const res2 = await app.request(
      `/api/users/${userId2}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({})
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
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('存在しない Instructor へのリンクは 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId: 'nonexistent-instructor-id' }) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const userId = await seedUser();
    const instructorId = await seedInstructor();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'POST', ...authJsonRequest(token, { instructorId }) },
      envWith({})
    );
    expect(res.status).toBe(403);
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
      envWith({})
    );

    // 解除する
    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({})
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
      envWith({})
    );
    expect(res.status).toBe(409);
  });

  it('存在しない ID は 404 を返す', async () => {
    const { token } = await seedAdminToken();
    const res = await app.request(
      '/api/users/nonexistent-id/link-instructor',
      { method: 'DELETE', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('MANAGER は 403 で弾かれる', async () => {
    const token = await seedManagerToken();
    const userId = await seedUser();

    const res = await app.request(
      `/api/users/${userId}/link-instructor`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });
});
