import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { shiftTypeListSchema, shiftTypeSchema } from '../src/features/shift-types/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { shiftTypes, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * ShiftType CRUD の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として、CRUD 操作を検証する。
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
  await db.delete(shiftTypes);
  await db.delete(users);
});

describe('GET /api/shift-types', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shift-types', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('シフト種別が0件のとき空配列を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request('/api/shift-types', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = shiftTypeListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('作成済みシフト種別を一覧で返す', async () => {
    const db = createDb(env.DB);
    await db.insert(shiftTypes).values({ name: '終日', isActive: true });
    await db.insert(shiftTypes).values({ name: '午前', isActive: true });

    const token = await seedManagerToken();
    const res = await app.request('/api/shift-types', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = shiftTypeListSchema.parse(await res.json());
    // デフォルトはアクティブのみ
    expect(body).toHaveLength(2);
  });

  it('active=false でアクティブ・非アクティブ両方を返す', async () => {
    const db = createDb(env.DB);
    await db.insert(shiftTypes).values({ name: '終日', isActive: true });
    await db.insert(shiftTypes).values({ name: '廃止種別', isActive: false });

    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types?active=false',
      authHeader(token),
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = shiftTypeListSchema.parse(await res.json());
    expect(body).toHaveLength(2);
  });
});

describe('GET /api/shift-types/:id', () => {
  it('存在するシフト種別を返す', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日' })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/shift-types/${st.id}`,
      authHeader(token),
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = shiftTypeSchema.parse(await res.json());
    expect(body.id).toBe(st.id);
    expect(body.name).toBe('終日');
    expect(body.isActive).toBe(true);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types/nonexistent-id',
      authHeader(token),
      envWith({})
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/shift-types', () => {
  it('MEMBER は 403 で拒否される', async () => {
    const token = await seedMemberToken();
    const res = await app.request(
      '/api/shift-types',
      { method: 'POST', ...authJsonRequest(token, { name: '終日' }) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER はシフト種別を作成できる', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types',
      { method: 'POST', ...authJsonRequest(token, { name: '終日' }) },
      envWith({})
    );

    expect(res.status).toBe(201);
    const body = shiftTypeSchema.parse(await res.json());
    expect(body.name).toBe('終日');
    expect(body.isActive).toBe(true);
  });

  it('バリデーションエラーは 400 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types',
      { method: 'POST', ...authJsonRequest(token, { name: '' }) },
      envWith({})
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/shift-types/:id', () => {
  it('name を更新できる', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日' })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/shift-types/${st.id}`,
      { method: 'PATCH', ...authJsonRequest(token, { name: '全日' }) },
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = shiftTypeSchema.parse(await res.json());
    expect(body.name).toBe('全日');
    expect(body.id).toBe(st.id);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types/nonexistent-id',
      { method: 'PATCH', ...authJsonRequest(token, { name: '変更後' }) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('空文字の name は 400 を返す', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日' })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/shift-types/${st.id}`,
      { method: 'PATCH', ...authJsonRequest(token, { name: '' }) },
      envWith({})
    );
    expect(res.status).toBe(400);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日' })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/shift-types/${st.id}`,
      { method: 'PATCH', ...authJsonRequest(token, { name: '変更後' }) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shift-types/:id/deactivate', () => {
  it('シフト種別を無効化できる（isActive=false）', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日', isActive: true })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/shift-types/${st.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );

    expect(res.status).toBe(200);
    const body = shiftTypeSchema.parse(await res.json());
    expect(body.isActive).toBe(false);

    // 無効化後は通常の一覧（アクティブのみ）に出ない
    const listRes = await app.request(
      '/api/shift-types',
      authHeader(token),
      envWith({})
    );
    const list = shiftTypeListSchema.parse(await listRes.json());
    expect(list.find((s) => s.id === st.id)).toBeUndefined();
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/shift-types/nonexistent-id/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(404);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const db = createDb(env.DB);
    const [st] = await db
      .insert(shiftTypes)
      .values({ name: '終日' })
      .returning();
    if (!st) throw new Error('insert failed');

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/shift-types/${st.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({})
    );
    expect(res.status).toBe(403);
  });
});
