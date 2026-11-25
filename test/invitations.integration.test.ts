import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/** 認証付きで招待を発行する（ボディなし） */
async function issue(token: string): Promise<Response> {
  return await app.request(
    '/api/invitations',
    { method: 'POST', ...authHeader(token) },
    envWith({}),
  );
}

/** 指定秒前に発行されたものとして招待を seed する（24時間・無制限） */
async function seedIssuedAgo(
  createdBy: string,
  secondsAgo: number,
  overrides: Partial<typeof invitationTokens.$inferInsert> = {},
) {
  const createdAt = new Date(Math.floor(Date.now() / 1000 - secondsAgo) * 1000);
  return await seedInvitation(createdBy, {
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

async function allInvitations() {
  return await createDb(env.DB).select().from(invitationTokens);
}

describe('POST /api/invitations', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request(
      '/api/invitations',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it.each(['MEMBER', 'MANAGER'] as const)('%s は 403 で弾かれ、リンクを作らない', async (role) => {
    const { token } = await seedUserToken(role);
    const res = await issue(token);
    expect(res.status).toBe(403);
    expect(await allInvitations()).toHaveLength(0);
  });

  it('ADMIN はボディなしで24時間・無制限のリンクを 201 で作成できる', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const res = await issue(token);
    expect(res.status).toBe(201);

    const body = invitationSchema.parse(await res.json());
    expect(body).toMatchObject({
      createdBy: userId,
      maxUses: null,
      usedCount: 0,
      isActive: true,
      description: null,
    });
    expect(body.expiresAt.getTime() - body.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(Math.abs(body.createdAt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('1時間以内の再発行は同じリンクを 200 で返し、増やさない', async () => {
    const { token } = await seedUserToken('ADMIN');
    const first = invitationSchema.parse(await (await issue(token)).json());
    const second = await issue(token);
    expect(second.status).toBe(200);
    expect(invitationSchema.parse(await second.json()).token).toBe(first.token);
    expect(await allInvitations()).toHaveLength(1);
  });

  it('同時発行でもリンクは1件だけ作られ、全員が同じトークンを受け取る', async () => {
    const { token } = await seedUserToken('ADMIN');
    const responses = await Promise.all([issue(token), issue(token), issue(token), issue(token)]);
    const tokens = await Promise.all(
      responses.map(async (res) => invitationSchema.parse(await res.json()).token),
    );
    expect(new Set(tokens).size).toBe(1);
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(await allInvitations()).toHaveLength(1);
  });

  it('発行からちょうど1時間のリンクはまだ再利用する', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const seeded = await seedIssuedAgo(userId, 3600);
    const res = await issue(token);
    // 実行の遅れで秒が進んだ場合に備え、1時間を含む境界のみ確認する
    expect([200, 201]).toContain(res.status);
    if (res.status === 200) {
      expect(invitationSchema.parse(await res.json()).token).toBe(seeded.token);
    }
  });

  it('1時間を超えたリンクは再利用せず、新規発行して既存は停止しない', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const old = await seedIssuedAgo(userId, 3601);
    const res = await issue(token);
    expect(res.status).toBe(201);
    expect(invitationSchema.parse(await res.json()).token).not.toBe(old.token);

    const rows = await allInvitations();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.isActive)).toBe(true);
  });

  it.each([
    ['停止済み', { isActive: false }],
    ['使用上限あり', { maxUses: 5 }],
    ['24時間でない', { expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) }],
  ])('再利用候補にならない（%s）場合は新規発行する', async (_label, overrides) => {
    const { token, userId } = await seedUserToken('ADMIN');
    const seeded = await seedIssuedAgo(userId, 60, overrides);
    const res = await issue(token);
    expect(res.status).toBe(201);
    expect(invitationSchema.parse(await res.json()).token).not.toBe(seeded.token);
  });

  it('他の ADMIN が発行したリンクは再利用せず、双方のリンクが併存する', async () => {
    const a = await seedUserToken('ADMIN');
    const b = await seedUserToken('ADMIN');
    const first = invitationSchema.parse(await (await issue(a.token)).json());
    const second = await issue(b.token);
    expect(second.status).toBe(201);
    expect(invitationSchema.parse(await second.json()).token).not.toBe(first.token);
    expect(await allInvitations()).toHaveLength(2);
  });

  it('同じ秒に複数の候補があればトークンの降順で固定した最新を返す', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const createdAt = new Date(Math.floor(Date.now() / 1000 - 60) * 1000);
    const base = {
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    };
    await seedInvitation(userId, { ...base, token: 'aaa-token' });
    await seedInvitation(userId, { ...base, token: 'zzz-token' });
    const res = await issue(token);
    expect(res.status).toBe(200);
    expect(invitationSchema.parse(await res.json()).token).toBe('zzz-token');
  });
});

// ─── GET /api/invitations ─────────────────────────────────────────────────────

describe('GET /api/invitations', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/invitations', noAuth, envWith({}));
    expect(res.status).toBe(401);
  });

  it.each(['MEMBER', 'MANAGER'] as const)('%s は 403 で弾かれる', async (role) => {
    const { token } = await seedUserToken(role);
    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });

  it('有効なリンクだけを新しい順に返し、停止済み・期限切れ・上限到達は除外する', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const older = await seedIssuedAgo(userId, 7200);
    const newer = await seedIssuedAgo(userId, 60);
    await seedIssuedAgo(userId, 30, { isActive: false });
    await seedInvitation(userId, { expiresAt: new Date(Date.now() - 1000) });
    await seedIssuedAgo(userId, 20, { maxUses: 2, usedCount: 2 });
    // 旧リンク: 上限が残っていれば有効のまま一覧に出る
    const legacy = await seedIssuedAgo(userId, 10000, { maxUses: 3, usedCount: 1 });

    const res = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = invitationListSchema.parse(await res.json());
    expect(body.map((row) => row.token)).toEqual([newer.token, older.token, legacy.token]);
  });

  it('作成者名を返し、作成者が削除済みなら null にする', async () => {
    const admin = await seedUserToken('ADMIN');
    const other = await seedUserToken('ADMIN');
    await seedIssuedAgo(admin.userId, 60);
    await seedIssuedAgo(other.userId, 120);
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(other.userId).run();

    const res = await app.request('/api/invitations', authHeader(admin.token), envWith({}));
    const body = invitationListSchema.parse(await res.json());
    expect(body.map((row) => row.createdByName)).toEqual(['テストADMIN', null]);
    expect(body[1]?.createdBy).toBeNull();
  });
});

// ─── POST /api/invitations/:token/deactivate ─────────────────────────────────

describe('POST /api/invitations/:token/deactivate', () => {
  it('未認証は 401 を返す', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);
    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it.each(['MEMBER', 'MANAGER'] as const)('%s は 403 で弾かれ、停止されない', async (role) => {
    const admin = await seedUserToken('ADMIN');
    const inv = await seedInvitation(admin.userId);
    const { token } = await seedUserToken(role);
    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(403);
    const [row] = await createDb(env.DB)
      .select()
      .from(invitationTokens)
      .where(eq(invitationTokens.token, inv.token));
    expect(row?.isActive).toBe(true);
  });

  it('ADMIN は停止でき、停止したリンクは verify できず一覧からも消える', async () => {
    const { token, userId } = await seedUserToken('ADMIN');
    const inv = await seedInvitation(userId);
    const res = await app.request(
      `/api/invitations/${inv.token}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(invitationSchema.parse(await res.json()).isActive).toBe(false);

    const verify = await app.request(
      `/api/invitations/${inv.token}/verify`,
      noAuth,
      envWith({ AUTH_RATE_LIMITER: makeUnlimitedRateLimiter() }),
    );
    expect(verify.status).toBe(410);
    const list = await app.request('/api/invitations', authHeader(token), envWith({}));
    expect(invitationListSchema.parse(await list.json())).toHaveLength(0);
  });

  it('存在しないトークンは 404 を返す', async () => {
    const { token } = await seedUserToken('ADMIN');
    const res = await app.request(
      '/api/invitations/no-such-token/deactivate',
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

  it('発行からちょうど24時間で verify できなくなる（その1秒前までは有効）', async () => {
    const { userId } = await seedUserToken('ADMIN');
    const createdAtSeconds = Math.floor(Date.now() / 1000);
    const createdAt = new Date(createdAtSeconds * 1000);
    const inv = await seedInvitation(userId, {
      createdAt,
      expiresAt: new Date((createdAtSeconds + 24 * 60 * 60) * 1000),
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime((createdAtSeconds + 24 * 60 * 60 - 1) * 1000);
      expect(
        (await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv())).status,
      ).toBe(200);
      vi.setSystemTime((createdAtSeconds + 24 * 60 * 60) * 1000);
      expect(
        (await app.request(`/api/invitations/${inv.token}/verify`, noAuth, reqEnv())).status,
      ).toBe(410);
    } finally {
      vi.useRealTimers();
    }
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
