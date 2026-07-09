import { env } from 'cloudflare:test';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  invitationListSchema,
  invitationSchema,
  verifyInvitationResponseSchema,
} from '../src/features/invitations/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { invitationTokens, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * Invitation（招待トークン管理）の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として、作成・一覧・無効化・検証・サインアップ・上限超過を検証する。
 */

/** レート制限を無効にするダミー limiter */
function makeUnlimitedRateLimiter() {
  return { limit: async () => ({ success: true }) };
}

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

const noAuth: RequestInit = {};

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' } };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * 指定ロールの User を1件作成し JWT を発行して返す。
 * 各テスト用 seed 関数はこれを呼ぶ。
 */
async function seedUserToken(
  role: 'ADMIN' | 'MANAGER' | 'MEMBER',
): Promise<{ token: string; userId: string }> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: `テスト${role}`,
      role,
      isActive: true,
    })
    .returning();
  if (!user) throw new Error(`seedUserToken: ${role} insert failed`);

  const token = await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role,
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  return { token, userId: user.id };
}

/**
 * 招待トークンを有効期限付きで DB に直接 seed する。
 * @param createdBy - 作成者 User の ID
 * @param overrides - 上書きするフィールド
 */
async function seedInvitation(
  createdBy: string,
  overrides: Partial<typeof invitationTokens.$inferInsert> = {},
): Promise<typeof invitationTokens.$inferSelect> {
  const db = createDb(env.DB);
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [inv] = await db
    .insert(invitationTokens)
    .values({
      token: crypto.randomUUID(),
      expiresAt,
      createdBy,
      maxUses: null,
      usedCount: 0,
      isActive: true,
      ...overrides,
    })
    .returning();
  if (!inv) throw new Error('seedInvitation: insert failed');
  return inv;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  // 外部キー依存順に削除する
  await db.delete(invitationTokens);
  await db.delete(users);
});

// ─── POST /api/invitations ────────────────────────────────────────────────────

describe('POST /api/invitations', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...noAuth, headers: { 'Content-Type': 'application/json' }, body: '{}' },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it('MEMBER は 403 で弾かれる', async () => {
    const { token } = await seedUserToken('MEMBER');
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER は招待トークンを作成できる', async () => {
    const { token } = await seedUserToken('MANAGER');
    const res = await app.request(
      '/api/invitations',
      {
        method: 'POST',
        ...authJsonRequest(token, { description: 'テスト招待', maxUses: 5 }),
      },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const body = invitationSchema.parse(await res.json());
    expect(body.description).toBe('テスト招待');
    expect(body.maxUses).toBe(5);
    expect(body.usedCount).toBe(0);
    expect(body.isActive).toBe(true);
  });

  it('ADMIN は招待トークンを作成できる', async () => {
    const { token } = await seedUserToken('ADMIN');
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const body = invitationSchema.parse(await res.json());
    expect(body.maxUses).toBeNull();
    expect(body.isActive).toBe(true);
  });

  it('expiresInHours を指定すると有効期限が設定される', async () => {
    const { token } = await seedUserToken('MANAGER');
    const before = Date.now();
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, { expiresInHours: 24 }) },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const body = invitationSchema.parse(await res.json());
    const expectedExpiresAt = before + 24 * 3600 * 1000;
    // 1 秒以内の誤差を許容する
    expect(Math.abs(body.expiresAt.getTime() - expectedExpiresAt)).toBeLessThan(2000);
  });

  it('expiresInHours 省略時は INVITE_DEFAULT_EXPIRES が使われる', async () => {
    const { token } = await seedUserToken('MANAGER');
    const before = Date.now();
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, {}) },
      // INVITE_DEFAULT_EXPIRES = "168h"（7日）
      envWith({ INVITE_DEFAULT_EXPIRES: '168h' }),
    );
    expect(res.status).toBe(201);

    const body = invitationSchema.parse(await res.json());
    const expectedExpiresAt = before + 168 * 3600 * 1000;
    expect(Math.abs(body.expiresAt.getTime() - expectedExpiresAt)).toBeLessThan(2000);
  });

  it('maxUses に 0 以下の値を渡すと 400 を返す', async () => {
    const { token } = await seedUserToken('MANAGER');
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, { maxUses: 0 }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('既存のアクティブな招待は新規作成時に自動失効する', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    const previous = await seedInvitation(userId, { description: '旧招待' });

    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, { description: '新招待' }) },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const db = createDb(env.DB);
    const [updatedPrevious] = await db
      .select({ isActive: invitationTokens.isActive })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, previous.token))
      .limit(1);
    expect(updatedPrevious?.isActive).toBe(false);

    const listRes = await app.request('/api/invitations', authHeader(token), envWith({}));
    const list = invitationListSchema.parse(await listRes.json());
    const activeRows = list.filter((inv) => inv.isActive);
    expect(activeRows.length).toBe(1);
    expect(activeRows[0]?.description).toBe('新招待');
  });

  it('期限切れだが isActive=true の招待も新規作成時に失効する', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    const expired = await seedInvitation(userId, {
      description: '期限切れ招待',
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const db = createDb(env.DB);
    const [updatedExpired] = await db
      .select({ isActive: invitationTokens.isActive })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, expired.token))
      .limit(1);
    expect(updatedExpired?.isActive).toBe(false);
  });

  it('複数のアクティブな招待が残っていても全て失効する（移行ケース）', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    const first = await seedInvitation(userId, { description: '招待1' });
    const second = await seedInvitation(userId, { description: '招待2' });

    const res = await app.request(
      '/api/invitations',
      { method: 'POST', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(201);

    const db = createDb(env.DB);
    const rows = await db
      .select({ token: invitationTokens.token, isActive: invitationTokens.isActive })
      .from(invitationTokens)
      .where(inArray(invitationTokens.token, [first.token, second.token]));
    expect(rows.every((row) => row.isActive === false)).toBe(true);
  });
});

// ─── GET /api/invitations ─────────────────────────────────────────────────────

describe('GET /api/invitations', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/invitations', noAuth, envWith({}));
    expect(res.status).toBe(401);
  });

  it('MEMBER は 403 で弾かれる', async () => {
    const { token } = await seedUserToken('MEMBER');
    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });

  it('MANAGER は招待一覧を取得できる', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    await seedInvitation(userId, { description: '招待A' });
    await seedInvitation(userId, { description: '招待B' });

    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const body = invitationListSchema.parse(await res.json());
    expect(body.length).toBe(2);
  });

  it('ADMIN は招待一覧を取得できる', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    await seedInvitation(userId);

    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const body = invitationListSchema.parse(await res.json());
    expect(body.length).toBe(1);
  });

  it('createdAt 降順で返す', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    const older = await seedInvitation(userId, {
      description: '古い招待',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const newer = await seedInvitation(userId, {
      description: '新しい招待',
      createdAt: new Date(),
    });

    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(200);

    const body = invitationListSchema.parse(await res.json());
    expect(body.map((inv) => inv.token)).toEqual([newer.token, older.token]);
  });
});

// ─── POST /api/invitations/:token/deactivate ──────────────────────────────────

describe('POST /api/invitations/:token/deactivate', () => {
  it('未認証は 401 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);

    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...noAuth, headers: { 'Content-Type': 'application/json' } },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it('MEMBER は 403 で弾かれる', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const { token: memberToken } = await seedUserToken('MEMBER');
    const inv = await seedInvitation(userId);

    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...authHeader(memberToken) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER は招待を無効化できる', async () => {
    const { token, userId } = await seedUserToken('MANAGER');
    const inv = await seedInvitation(userId);

    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = invitationSchema.parse(await res.json());
    expect(body.isActive).toBe(false);
  });

  it('ADMIN は招待を無効化できる', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);

    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = invitationSchema.parse(await res.json());
    expect(body.isActive).toBe(false);
  });

  it('存在しないトークンは 404 を返す', async () => {
    const { token } = await seedUserToken('ADMIN');
    const res = await app.request(
      '/api/invitations/nonexistent-token/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/invitations/:token/verify ──────────────────────────────────────

describe('GET /api/invitations/:token/verify', () => {
  const reqEnv = () => envWith({ AUTH_RATE_LIMITER: makeUnlimitedRateLimiter() });

  it('有効なトークンは 200 と公開用フィールドのみを返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { description: '有効招待' });

    const res = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv());
    expect(res.status).toBe(200);

    const body = verifyInvitationResponseSchema.parse(await res.json());
    expect(body.token).toBe(inv.token);
    expect(body.description).toBe('有効招待');
    // createdBy などの内部フィールドが含まれていないことを確認する
    expect(body).not.toHaveProperty('createdBy');
    expect(body).not.toHaveProperty('usedCount');
    expect(body).not.toHaveProperty('isActive');
  });

  it('存在しないトークンは 404 を返す', async () => {
    const res = await app.request('/api/invitations/nonexistent-token/verify', noAuth, reqEnv());
    expect(res.status).toBe(404);
  });

  it('無効化済みトークンは 410 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { isActive: false });

    const res = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv());
    expect(res.status).toBe(410);
  });

  it('期限切れトークンは 410 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv());
    expect(res.status).toBe(410);
  });

  it('使用上限超過トークンは 422 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { maxUses: 3, usedCount: 3 });

    const res = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv());
    expect(res.status).toBe(422);
  });

  it('maxUses=null（無制限）かつ usedCount が高くても有効', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { maxUses: null, usedCount: 9999 });

    const res = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv());
    expect(res.status).toBe(200);
  });

  it('Rate Limit を超過すると 429 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);
    let count = 0;
    const limitedEnv = envWith({
      AUTH_RATE_LIMITER: {
        limit: async () => {
          count++;
          return { success: count <= 2 };
        },
      },
    });

    const res1 = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, limitedEnv);
    const res2 = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, limitedEnv);
    const res3 = await app.request(`/api/invitations/${inv.token}/verify`, noAuth, limitedEnv);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(429);
  });
});

// ─── サインアップ・used_count 原子性 ─────────────────────────────────────────

describe('used_count の原子的インクリメント（consumeInvitation 相当）', () => {
  /**
   * auth/api.ts の `consumeInvitation` と同等の DB 操作を実行する。
   * 条件付き UPDATE で read-then-write レースを DB 制約に寄せる ADR 0006 の動作を検証する。
   */
  async function consumeInvitation(token: string): Promise<boolean> {
    const db = createDb(env.DB);
    const now = new Date();
    const result = await db
      .update(invitationTokens)
      .set({ usedCount: sql`${invitationTokens.usedCount} + 1` })
      .where(
        and(
          eq(invitationTokens.token, token),
          eq(invitationTokens.isActive, true),
          gt(invitationTokens.expiresAt, now),
          or(
            isNull(invitationTokens.maxUses),
            gt(invitationTokens.maxUses, invitationTokens.usedCount),
          ),
        ),
      );
    return result.meta.rows_written > 0;
  }

  it('有効な招待を消費すると usedCount が 1 増える', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);

    const ok = await consumeInvitation(inv.token);
    expect(ok).toBe(true);

    const db = createDb(env.DB);
    const [updated] = await db
      .select({ usedCount: invitationTokens.usedCount })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, inv.token))
      .limit(1);
    expect(updated?.usedCount).toBe(1);
  });

  it('有効な招待を消費して User が作成される（サインアップ相当）', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);

    const ok = await consumeInvitation(inv.token);
    expect(ok).toBe(true);

    // consumeInvitation 成功後に User を作成する（LINE OAuth callback 相当）
    const db = createDb(env.DB);
    const [newUser] = await db
      .insert(users)
      .values({
        lineUserId: `line-${crypto.randomUUID()}`,
        displayName: '新規ユーザー',
        role: 'MEMBER',
        isActive: true,
      })
      .returning();
    expect(newUser).toBeDefined();
    expect(newUser?.displayName).toBe('新規ユーザー');
  });

  it('使用上限に達した招待は消費されない', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { maxUses: 2, usedCount: 2 });

    const ok = await consumeInvitation(inv.token);
    expect(ok).toBe(false);

    const db = createDb(env.DB);
    const [unchanged] = await db
      .select({ usedCount: invitationTokens.usedCount })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, inv.token))
      .limit(1);
    // usedCount は変わらない
    expect(unchanged?.usedCount).toBe(2);
  });

  it('maxUses を 1 超えた場合、2 回目の消費は失敗する（上限超過）', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { maxUses: 1 });

    const first = await consumeInvitation(inv.token);
    expect(first).toBe(true);

    // 2回目は上限超過で失敗する
    const second = await consumeInvitation(inv.token);
    expect(second).toBe(false);

    const db = createDb(env.DB);
    const [row] = await db
      .select({ usedCount: invitationTokens.usedCount })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, inv.token))
      .limit(1);
    expect(row?.usedCount).toBe(1);
  });

  it('無効化済みの招待は消費されない', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, { isActive: false });

    const ok = await consumeInvitation(inv.token);
    expect(ok).toBe(false);
  });

  it('期限切れの招待は消費されない', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const ok = await consumeInvitation(inv.token);
    expect(ok).toBe(false);
  });
});
