import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { meResponseSchema } from '../src/features/auth/schema';
import app from '../src/index';
import { signJwt, type UserRole } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '../src/server/middleware/auth';
import type { Env } from '../src/server/types';

/**
 * 認証の統合テスト（実 D1・seed した User）。Hono の HTTP 境界 × 実 D1 を継ぎ目として、
 * login / me / ロール強制 / Rate Limit / logout を検証する（ADR 0003/0004、PRD テスト方針）。
 */

/** テスト中に件数を数える擬似 Rate Limiter。CF ネイティブ binding はローカルで決定論的に動かせないため注入する */
function makeRateLimiter(limit: number) {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }: { key: string }) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { success: next <= limit };
    },
  };
}

/** env に上書きを足して `app.request` の第3引数として渡す */
function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

/** Cookie に JWT を載せたリクエスト init を作る */
function cookieHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}` } };
}

/** seed: User を1件作成して返す */
async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テスト太郎',
      role: 'MEMBER',
      isActive: true,
      ...overrides,
    })
    .returning();
  if (!user) {
    throw new Error('seedUser failed');
  }
  return user;
}

/** seed した User に対応する JWT を発行する */
async function tokenFor(
  user: { id: string; lineUserId: string; displayName: string },
  role: UserRole,
  isActive = true,
) {
  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role,
      isActive,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

beforeEach(async () => {
  // 各テストを独立させるため User を全削除する
  await createDb(env.DB).delete(users);
});

describe('GET /api/auth/line/login', () => {
  it('state Cookie を設定し LINE 認証画面へ 302 リダイレクトする', async () => {
    const res = await app.request(
      '/api/auth/line/login?redirect=/shifts',
      {},
      envWith({ AUTH_RATE_LIMITER: makeRateLimiter(20) }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('https://access.line.me/oauth2/v2.1/authorize');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('auth-session=');
  });
});

describe('GET /api/auth/me', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/auth/me', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('有効な JWT を持つアクティブ User の情報とロールを返す', async () => {
    const user = await seedUser({ role: 'MANAGER' });
    const token = await tokenFor(user, 'MANAGER');

    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = meResponseSchema.parse(await res.json());
    expect(body.id).toBe(user.id);
    expect(body.role).toBe('MANAGER');
    expect(body.isActive).toBe(true);
  });

  it('非アクティブ（isActive=false）の JWT は 403 で弾く', async () => {
    const user = await seedUser({ isActive: false });
    const token = await tokenFor(user, 'MEMBER', false);

    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));

    expect(res.status).toBe(403);
  });
});

describe('ロールミドルウェア（requireRole）', () => {
  // MANAGER 以上を要求する保護ルートを用意して序列を検証する
  const roleApp = new Hono<{ Bindings: Env; Variables: AuthVariables }>().get(
    '/protected',
    requireAuth,
    requireRole('MANAGER'),
    (c) => c.json({ ok: true } as const),
  );

  it('MEMBER は 403 で拒否される', async () => {
    const user = await seedUser({ role: 'MEMBER' });
    const token = await tokenFor(user, 'MEMBER');
    const res = await roleApp.request('/protected', cookieHeader(token), envWith({}));
    expect(res.status).toBe(403);
  });

  it('MANAGER は通過する', async () => {
    const user = await seedUser({ role: 'MANAGER' });
    const token = await tokenFor(user, 'MANAGER');
    const res = await roleApp.request('/protected', cookieHeader(token), envWith({}));
    expect(res.status).toBe(200);
  });

  it('ADMIN は通過する（上位ロール）', async () => {
    const user = await seedUser({ role: 'ADMIN' });
    const token = await tokenFor(user, 'ADMIN');
    const res = await roleApp.request('/protected', cookieHeader(token), envWith({}));
    expect(res.status).toBe(200);
  });
});

describe('Rate Limit（認証系のみ）', () => {
  it('上限を超えた login リクエストは 429 を返す', async () => {
    const limiter = makeRateLimiter(2);
    const reqEnv = envWith({ AUTH_RATE_LIMITER: limiter });

    const first = await app.request('/api/auth/line/login', {}, reqEnv);
    const second = await app.request('/api/auth/line/login', {}, reqEnv);
    const third = await app.request('/api/auth/line/login', {}, reqEnv);

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(third.status).toBe(429);
  });

  it('認証済み一般 API（/me）には Rate Limit を適用しない', async () => {
    const user = await seedUser();
    const token = await tokenFor(user, 'MEMBER');
    // limit=0 の limiter を渡しても /me は limiter を参照しないため 200 のまま
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(0) });
    const res = await app.request('/api/auth/me', cookieHeader(token), reqEnv);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('JWT Cookie を破棄してセッションを終了する', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST' }, envWith({}));

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    // auth-token を即時失効させる（Max-Age=0）
    expect(setCookie).toContain('auth-token=');
    expect(setCookie.toLowerCase()).toContain('max-age=0');
  });
});
