import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { departmentListSchema, departmentSchema } from '../src/features/departments/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { departments, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * Department CRUD の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として、CRUD 操作とユニーク制約違反を検証する。
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

/** seed: MEMBER ロールの User を1件作成し、JWT を発行して返す */
async function seedMemberToken(): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テストメンバー',
      role: 'MEMBER',
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedMemberToken: user insert failed');

  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: 'MEMBER',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );
}

beforeEach(async () => {
  // 各テストを独立させるためデータを全削除する（外部キー依存順に削除）
  const db = createDb(env.DB);
  await db.delete(departments);
  await db.delete(users);
});

describe('GET /api/departments', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/departments', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('部門が0件のとき空配列を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request('/api/departments', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = departmentListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('作成済み部門を一覧で返す', async () => {
    const db = createDb(env.DB);
    await db.insert(departments).values({ code: 'ski', name: 'スキー', isActive: true });
    await db.insert(departments).values({ code: 'snow', name: 'スノーボード', isActive: true });

    const token = await seedManagerToken();
    const res = await app.request('/api/departments', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = departmentListSchema.parse(await res.json());
    // デフォルトはアクティブのみ（active=true）
    expect(body).toHaveLength(2);
  });

  it('active=false でアクティブ・非アクティブ両方を返す', async () => {
    const db = createDb(env.DB);
    await db.insert(departments).values({ code: 'ski', name: 'スキー', isActive: true });
    await db.insert(departments).values({ code: 'snow', name: 'スノーボード', isActive: false });

    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments?active=false',
      authHeader(token),
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = departmentListSchema.parse(await res.json());
    expect(body).toHaveLength(2);
  });
});

describe('GET /api/departments/:id', () => {
  it('存在する部門を返す', async () => {
    const db = createDb(env.DB);
    const [dept] = await db
      .insert(departments)
      .values({ code: 'ski', name: 'スキー' })
      .returning();
    if (!dept) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/departments/${dept.id}`,
      authHeader(token),
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = departmentSchema.parse(await res.json());
    expect(body.id).toBe(dept.id);
    expect(body.code).toBe('ski');
    expect(body.name).toBe('スキー');
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments/nonexistent-id',
      authHeader(token),
      envWith({})
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/departments', () => {
  it('MEMBER は 403 で拒否される', async () => {
    const token = await seedMemberToken();
    const res = await app.request(
      '/api/departments',
      { method: 'POST', ...authJsonRequest(token, { code: 'ski', name: 'スキー' }) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER は部門を作成できる', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          code: 'ski',
          name: 'スキー',
          description: 'スキー部門',
        }),
      },
      envWith({})
    );

    expect(res.status).toBe(201);
    const body = departmentSchema.parse(await res.json());
    expect(body.code).toBe('ski');
    expect(body.name).toBe('スキー');
    expect(body.description).toBe('スキー部門');
    expect(body.isActive).toBe(true);
  });

  it('code の重複は 409 を返す（ユニーク制約違反）', async () => {
    const token = await seedManagerToken();
    const create = () =>
      app.request(
        '/api/departments',
        { method: 'POST', ...authJsonRequest(token, { code: 'ski', name: 'スキー' }) },
        envWith({})
      );

    const first = await create();
    expect(first.status).toBe(201);

    const second = await create();
    expect(second.status).toBe(409);
  });

  it('バリデーションエラーは 400 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments',
      { method: 'POST', ...authJsonRequest(token, { code: '', name: 'スキー' }) },
      envWith({})
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/departments/:id', () => {
  it('name と description を更新できる', async () => {
    const db = createDb(env.DB);
    const [dept] = await db
      .insert(departments)
      .values({ code: 'ski', name: 'スキー' })
      .returning();
    if (!dept) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/departments/${dept.id}`,
      {
        method: 'PATCH',
        ...authJsonRequest(token, { name: 'アルペンスキー', description: '更新済み' }),
      },
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = departmentSchema.parse(await res.json());
    expect(body.name).toBe('アルペンスキー');
    expect(body.description).toBe('更新済み');
    // code は変更不可
    expect(body.code).toBe('ski');
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments/nonexistent-id',
      { method: 'PATCH', ...authJsonRequest(token, { name: '変更後' }) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('更新フィールドが1つもない空ボディは 400 を返す', async () => {
    const db = createDb(env.DB);
    const [dept] = await db
      .insert(departments)
      .values({ code: 'ski', name: 'スキー' })
      .returning();
    if (!dept) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/departments/${dept.id}`,
      { method: 'PATCH', ...authJsonRequest(token, {}) },
      envWith({})
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/departments/:id/deactivate', () => {
  it('部門を無効化できる（isActive=false）', async () => {
    const db = createDb(env.DB);
    const [dept] = await db
      .insert(departments)
      .values({ code: 'ski', name: 'スキー', isActive: true })
      .returning();
    if (!dept) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/departments/${dept.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = departmentSchema.parse(await res.json());
    expect(body.isActive).toBe(false);

    // 無効化後は通常の一覧（アクティブのみ）に出ない
    const listRes = await app.request(
      '/api/departments',
      authHeader(token),
      envWith({})
    );
    const list = departmentListSchema.parse(await listRes.json());
    expect(list.find((d) => d.id === dept.id)).toBeUndefined();
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/departments/nonexistent-id/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const db = createDb(env.DB);
    const [dept] = await db
      .insert(departments)
      .values({ code: 'ski', name: 'スキー' })
      .returning();
    if (!dept) throw new Error('insert failed');

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/departments/${dept.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });
});
