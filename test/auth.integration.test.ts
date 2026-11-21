import { env } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { decodeJwt, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLineLoginUrl } from '../src/features/auth/login-policy';
import { meResponseSchema } from '../src/features/auth/schema';
import app from '../src/index';
import { signJwt, verifyJwt, type UserRole } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { instructors, invitationTokens, users } from '../src/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '../src/server/middleware/auth';
import type { Env } from '../src/server/types';
import { interruptBeforeBatch } from './d1-interrupt';

/**
 * 認証の統合テスト（実 D1・seed した User）。Hono の HTTP 境界 × 実 D1 を継ぎ目として、
 * login / me / ロール強制 / Rate Limit / logout を検証する（PRD テスト方針）。
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

/** Cookie に JWT を載せたリクエスト init を作る（同一オリジンからの正規リクエストを模す） */
function cookieHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}`, 'sec-fetch-site': 'same-origin' } };
}

/** Cookie に JWT を載せた JSON リクエスト init を作る */
function cookieJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
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

/** LINE ユーザー ID から作成済み User の ID を引く（ログインで登録・特定された User の確認用） */
async function userIdByLineUserId(lineUserId: string): Promise<string> {
  const [user] = await createDb(env.DB)
    .select({ id: users.id })
    .from(users)
    .where(eq(users.lineUserId, lineUserId))
    .limit(1);
  if (!user) {
    throw new Error(`User not found: ${lineUserId}`);
  }
  return user.id;
}

/** seed した User に対応する JWT を発行する */
async function tokenFor(
  user: { id: string; displayName: string },
  role: UserRole,
  isActive = true,
) {
  return await signJwt(
    {
      userId: user.id,
      displayName: user.displayName,
      role,
      isActive,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

beforeEach(async () => {
  // 各テストを独立させるため User・Instructor を全削除する（外部キー依存順）
  const db = createDb(env.DB);
  await db.delete(invitationTokens);
  await db.delete(users);
  await db.delete(instructors);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('セッションのスライディング更新と絶対期限', () => {
  const sessionApp = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get('/session', requireAuth, (c) => c.json(c.get('user')))
    .get('/manager', requireAuth, requireRole('MANAGER'), (c) => c.json({ ok: true }));

  /** 初回ログイン時刻と発行時刻を指定した署名済みトークンを作る。旧形式も再現する */
  async function sessionToken(
    user: Awaited<ReturnType<typeof seedUser>>,
    issuedAt: number,
    authTime: unknown = issuedAt,
    expiresAt = issuedAt + 7200,
    extraClaims: Record<string, unknown> = {},
  ) {
    return new SignJWT({
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      ...(authTime === null ? {} : { authTime }),
      ...extraClaims,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('fuyugyo')
      .setAudience('fuyugyo-users')
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(new TextEncoder().encode(env.JWT_SECRET));
  }

  it('15分未満では更新せず、15分経過すると同じ初回ログイン時刻で2時間延長する', async () => {
    const user = await seedUser();
    const start = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, start);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((start + 899) * 1000);
    const before = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(before.status).toBe(200);
    expect(before.headers.get('set-cookie')).toBeNull();

    vi.setSystemTime((start + 900) * 1000);
    const refreshed = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(refreshed.status).toBe(200);
    const cookie = refreshed.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('Max-Age=7200');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const refreshedToken = cookie.match(/auth-token=([^;]+)/)?.[1] ?? '';
    const verified = await verifyJwt(refreshedToken, env.JWT_SECRET);
    expect(verified).toMatchObject({
      success: true,
      payload: { authTime: start, iat: start + 900 },
    });
    expect(decodeJwt(refreshedToken).exp).toBe(start + 8100);

    vi.setSystemTime((start + 7200) * 1000);
    const continued = await sessionApp.request(
      '/session',
      cookieHeader(refreshedToken),
      envWith({}),
    );
    expect(continued.status).toBe(200);
    const idle = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(idle.status).toBe(401);
    expect(idle.headers.get('set-cookie')).toBeNull();
  });

  it('lineUserId を含む旧形式のJWTも受け付け、更新後のJWTからは lineUserId を除く', async () => {
    const user = await seedUser();
    const start = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, start, start, start + 7200, {
      lineUserId: user.lineUserId,
    });
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime((start + 1) * 1000);
    const before = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(before.status).toBe(200);
    expect(await before.json()).not.toHaveProperty('lineUserId');

    vi.setSystemTime((start + 900) * 1000);
    const refreshed = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(refreshed.status).toBe(200);
    const refreshedToken =
      refreshed.headers.get('set-cookie')?.match(/auth-token=([^;]+)/)?.[1] ?? '';
    expect(decodeJwt(refreshedToken)).toMatchObject({ userId: user.id, authTime: start });
    expect(decodeJwt(refreshedToken)).not.toHaveProperty('lineUserId');
  });

  it('更新時のDBのロール降格を同じリクエストの権限判定に反映する', async () => {
    const user = await seedUser({ role: 'MANAGER' });
    const now = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, now - 900);
    await env.DB.prepare('UPDATE users SET role = ?, display_name = ? WHERE id = ?')
      .bind('MEMBER', '変更後の名前', user.id)
      .run();
    const res = await sessionApp.request('/manager', cookieHeader(token), envWith({}));
    expect(res.status).toBe(403);
    const cookie = res.headers.get('set-cookie') ?? '';
    const refreshedToken = cookie.match(/auth-token=([^;]+)/)?.[1] ?? '';
    expect(await verifyJwt(refreshedToken, env.JWT_SECRET)).toMatchObject({
      success: true,
      payload: { role: 'MEMBER', displayName: '変更後の名前' },
    });
  });

  it('更新間隔と絶対期限は環境変数で変更できる', async () => {
    const user = await seedUser();
    const now = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, now - 60, now - 3600);
    const refreshed = await sessionApp.request(
      '/session',
      cookieHeader(token),
      envWith({
        JWT_REFRESH_INTERVAL: '1m',
        JWT_EXPIRES_IN: '1h',
        JWT_ABSOLUTE_EXPIRES_IN: '2h',
        APP_URL: 'https://example.com',
      }),
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.get('set-cookie')).toContain('Max-Age=3600');
    expect(refreshed.headers.get('set-cookie')).toContain('Secure');
    const expired = await sessionApp.request(
      '/session',
      cookieHeader(token),
      envWith({
        JWT_ABSOLUTE_EXPIRES_IN: '1h',
      }),
    );
    expect(expired.status).toBe(401);
  });

  it('Authorization ヘッダ経由でも同じ方式で更新する', async () => {
    const user = await seedUser();
    const token = await sessionToken(user, Math.floor(Date.now() / 1000) - 900);
    const res = await sessionApp.request(
      '/session',
      { headers: { authorization: `Bearer ${token}` } },
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('auth-token=');
  });

  it('DBで無効化されたユーザーは更新時に403になり再発行しない', async () => {
    const user = await seedUser();
    const token = await sessionToken(user, Math.floor(Date.now() / 1000) - 900);
    await env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(user.id).run();
    const res = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('DBから削除されたユーザーは更新時に401になる', async () => {
    const user = await seedUser();
    const token = await sessionToken(user, Math.floor(Date.now() / 1000) - 900);
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    const res = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('発行直後でも初回ログインから7日経過した時点で401になる', async () => {
    const user = await seedUser();
    const now = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, now, now - 604800);
    const res = await sessionApp.request('/session', cookieHeader(token), envWith({}));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('7日の直前は利用できるが、更新間隔未満でも絶対期限に達すると401になる', async () => {
    const user = await seedUser();
    const now = Math.floor(Date.now() / 1000);
    const token = await sessionToken(user, now, now - 604799);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now * 1000);
    expect((await sessionApp.request('/session', cookieHeader(token), envWith({}))).status).toBe(
      200,
    );
    vi.setSystemTime((now + 1) * 1000);
    expect((await sessionApp.request('/session', cookieHeader(token), envWith({}))).status).toBe(
      401,
    );
  });

  it.each([null, 'invalid', -1])(
    '初回ログイン時刻が不正なJWT（%s）は401になる',
    async (authTime) => {
      const user = await seedUser();
      const token = await sessionToken(user, Math.floor(Date.now() / 1000), authTime);
      expect((await sessionApp.request('/session', cookieHeader(token), envWith({}))).status).toBe(
        401,
      );
    },
  );

  it.each([1, 5, 6])(
    '発行時刻が現在より%s秒先の場合、5秒以内の時計差だけ許容する',
    async (offset) => {
      const user = await seedUser();
      const now = Math.floor(Date.now() / 1000);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now * 1000);
      const token = await sessionToken(user, now + offset);
      const res = await sessionApp.request('/session', cookieHeader(token), envWith({}));
      expect(res.status).toBe(offset <= 5 ? 200 : 401);
      expect(res.headers.get('set-cookie')).toBeNull();
    },
  );

  it('時計差の許容によってJWTの有効期限を延長しない', async () => {
    const user = await seedUser();
    const now = Math.floor(Date.now() / 1000);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now * 1000);
    const token = await sessionToken(user, now - 7200);
    expect((await sessionApp.request('/session', cookieHeader(token), envWith({}))).status).toBe(
      401,
    );
  });
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

describe('LINE OAuth コールバック', () => {
  /** OAuth 開始エンドポイントを通して state と Cookie を取得する */
  async function startOAuth(
    path = '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=test-invitation',
  ) {
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(20) });
    const res = await app.request(path, {}, reqEnv);
    const state = new URL(res.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    return { reqEnv, state, cookie };
  }

  it.each(['cancelled', 'token', 'profile', 'network'])(
    '認証途中の失敗（%s）でも検証済みの招待と戻り先を保持する',
    async (failure) => {
      const { reqEnv, state, cookie } = await startOAuth();
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('接続失敗'));
      if (failure === 'token') fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
      if (failure === 'profile') {
        fetchMock
          .mockResolvedValueOnce(Response.json({ access_token: 'access-token' }))
          .mockResolvedValueOnce(new Response(null, { status: 400 }));
      }
      const query = new URLSearchParams({
        state,
        ...(failure === 'cancelled' ? { error: 'access_denied' } : { code: 'code' }),
      });
      const res = await app.request(
        `/api/auth/line/callback?${query}`,
        { headers: { cookie } },
        reqEnv,
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('invite')).toBe('test-invitation');
      expect(location.searchParams.get('redirect')).toBe('/shifts?date=2026-01');
      expect(location.searchParams.get('error')).toBe(
        failure === 'token'
          ? 'token_exchange_failed'
          : failure === 'profile'
            ? 'profile_fetch_failed'
            : 'auth_failed',
      );
      if (failure === 'cancelled') expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('認証エラーから手動再試行すると、元の招待で登録して元の画面へ戻れる', async () => {
    const owner = await seedUser({ role: 'ADMIN' });
    await createDb(env.DB)
      .insert(invitationTokens)
      .values({
        token: 'test-invitation',
        createdBy: owner.id,
        expiresAt: new Date(Date.now() + 3600000),
        maxUses: 1,
      });
    const first = await startOAuth();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    const failure = await app.request(
      `/api/auth/line/callback?code=code&state=${encodeURIComponent(first.state)}`,
      {
        headers: { cookie: first.cookie },
      },
      first.reqEnv,
    );
    const errorUrl = new URL(failure.headers.get('location') ?? '');
    const retry = await startOAuth(
      getLineLoginUrl({
        redirect: errorUrl.searchParams.get('redirect') ?? undefined,
        invite: errorUrl.searchParams.get('invite') ?? undefined,
      }),
    );
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        Response.json({ userId: 'retry-user', displayName: '再試行ユーザー' }),
      );
    const success = await app.request(
      `/api/auth/line/callback?code=retry-code&state=${encodeURIComponent(retry.state)}`,
      {
        headers: { cookie: retry.cookie },
      },
      retry.reqEnv,
    );
    expect(success.status).toBe(302);
    expect(success.headers.get('location')).toBe(`${retry.reqEnv.APP_URL}/shifts?date=2026-01`);
    const token = success.headers.get('set-cookie')?.match(/auth-token=([^;]+)/)?.[1] ?? '';
    const created = await userIdByLineUserId('retry-user');
    expect(await verifyJwt(token, retry.reqEnv.JWT_SECRET)).toMatchObject({
      success: true,
      payload: { userId: created },
    });
    expect(decodeJwt(token)).not.toHaveProperty('lineUserId');
  });

  it('state の不一致やセッション不正時には検証できていない再試行情報を引き継がない', async () => {
    const { reqEnv, cookie, state } = await startOAuth();
    const invalidState = await app.request(
      '/api/auth/line/callback?code=code&state=wrong-state',
      { headers: { cookie } },
      reqEnv,
    );
    expect(invalidState.headers.get('location')).toBe(
      `${reqEnv.APP_URL}/login?error=invalid_state`,
    );
    const invalidSession = await app.request(
      `/api/auth/line/callback?code=code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: `auth-session=${encodeURIComponent(JSON.stringify({ state }))}` },
      },
      reqEnv,
    );
    expect(invalidSession.headers.get('location')).toBe(
      `${reqEnv.APP_URL}/login?error=invalid_session`,
    );
    const expired = await app.request(
      `/api/auth/line/callback?code=code&state=${encodeURIComponent(state)}`,
      {},
      reqEnv,
    );
    expect(expired.headers.get('location')).toBe(`${reqEnv.APP_URL}/login?error=session_expired`);
  });

  it('state を検証できても外部URLを再試行の戻り先として渡さない', async () => {
    const { reqEnv, state, cookie } = await startOAuth(
      '/api/auth/line/login?redirect=https%3A%2F%2Fevil.example&invite=test-invitation',
    );
    const res = await app.request(
      `/api/auth/line/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
      reqEnv,
    );
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.searchParams.get('redirect')).toBe('/');
  });

  it('招待経由で初回ログイン時刻を持つJWTを発行し、元のパスとクエリへ戻る', async () => {
    const owner = await seedUser({ role: 'ADMIN' });
    const db = createDb(env.DB);
    await db.insert(invitationTokens).values({
      token: 'test-invitation',
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 3600000),
      maxUses: 1,
    });
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(20) });
    const login = await app.request(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=test-invitation',
      {},
      reqEnv,
    );
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const sessionCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'line-access-token' }))
      .mockResolvedValueOnce(
        Response.json({ userId: 'new-line-user', displayName: '新規ユーザー' }),
      );

    const res = await app.request(
      `/api/auth/line/callback?code=test-code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: sessionCookie },
      },
      reqEnv,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${reqEnv.APP_URL}/shifts?date=2026-01`);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('Max-Age=7200');
    const token = cookie.match(/auth-token=([^;]+)/)?.[1] ?? '';
    const verified = await verifyJwt(token, reqEnv.JWT_SECRET);
    const created = await userIdByLineUserId('new-line-user');
    expect(verified).toMatchObject({
      success: true,
      payload: { userId: created, role: 'MEMBER' },
    });
    const claims = decodeJwt(token);
    expect(claims).not.toHaveProperty('lineUserId');
    expect(claims.authTime).toBe(claims.iat);
    expect(claims.exp).toBe(Number(claims.iat) + 7200);
  });

  it('既存ユーザーは招待なしでログインでき、JWTに lineUserId を含めない', async () => {
    const user = await seedUser({ role: 'MANAGER' });
    const { reqEnv, state, cookie } = await startOAuth('/api/auth/line/login?redirect=%2Fshifts');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'line-access-token' }))
      .mockResolvedValueOnce(
        Response.json({ userId: user.lineUserId, displayName: user.displayName }),
      );

    const res = await app.request(
      `/api/auth/line/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
      reqEnv,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${reqEnv.APP_URL}/shifts`);
    const token = res.headers.get('set-cookie')?.match(/auth-token=([^;]+)/)?.[1] ?? '';
    expect(await verifyJwt(token, reqEnv.JWT_SECRET)).toMatchObject({
      success: true,
      payload: { userId: user.id, role: 'MANAGER' },
    });
    expect(decodeJwt(token)).not.toHaveProperty('lineUserId');
  });

  it('OAuth エラー時は自動ログインを停止する error パラメーター付きで戻る', async () => {
    const res = await app.request(
      '/api/auth/line/callback?error=access_denied',
      {},
      envWith({ AUTH_RATE_LIMITER: makeRateLimiter(20) }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${env.APP_URL}/login?error=auth_failed`);
  });
});

describe('GET /api/auth/me', () => {
  it('未認証の保護APIはDBに触れず401を返す', async () => {
    const inaccessibleDb = new Proxy(env.DB, {
      get() {
        throw new Error('未認証リクエストがDBへ到達しました');
      },
    });
    for (const path of ['/api/auth/me', '/api/users', '/api/shifts']) {
      const res = await app.request(path, {}, envWith({ DB: inaccessibleDb }));
      expect(res.status).toBe(401);
    }
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/auth/me', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('有効な JWT を持つアクティブ User の情報とロールを返す', async () => {
    const user = await seedUser({ role: 'MANAGER' });
    const token = await tokenFor(user, 'MANAGER');

    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).not.toHaveProperty('lineUserId');
    const body = meResponseSchema.parse(json);
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

describe('/api/auth/me/link-instructor（廃止済み）', () => {
  it('セルフ紐付け・解除のルートは存在せず 404 を返す', async () => {
    const user = await seedUser({ role: 'MEMBER' });
    const token = await tokenFor(user, 'MEMBER');
    const instructorId = await seedInstructor();

    const post = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(post.status).toBe(404);

    const del = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'DELETE', ...cookieHeader(token) },
      envWith({}),
    );
    expect(del.status).toBe(404);
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
  it('上限を超えた login リクエストはログイン画面へ rate_limited 付きで戻す', async () => {
    const limiter = makeRateLimiter(2);
    const reqEnv = envWith({ AUTH_RATE_LIMITER: limiter });

    const first = await app.request('/api/auth/line/login', {}, reqEnv);
    const second = await app.request('/api/auth/line/login', {}, reqEnv);
    const third = await app.request('/api/auth/line/login', {}, reqEnv);

    expect(first.headers.get('location')).toContain('https://access.line.me/');
    expect(second.headers.get('location')).toContain('https://access.line.me/');
    expect(third.status).toBe(302);
    expect(third.headers.get('location')).toBe(
      `${reqEnv.APP_URL}/login?error=rate_limited&redirect=%2F`,
    );
    // 超過時は OAuth を開始しないため、auth-session Cookie を発行しない
    expect(third.headers.get('set-cookie')).toBeNull();
  });

  it('login の超過時は再試行用に招待と戻り先を引き継ぐ', async () => {
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(0) });
    const res = await app.request(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=test-invitation',
      {},
      reqEnv,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      `${reqEnv.APP_URL}/login?error=rate_limited&redirect=%2Fshifts%3Fdate%3D2026-01&invite=test-invitation`,
    );
  });

  it('login の超過時も外部への戻り先は引き継がない', async () => {
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(0) });
    const res = await app.request(
      '/api/auth/line/login?redirect=https%3A%2F%2Fevil.example.com',
      {},
      reqEnv,
    );

    expect(res.headers.get('location')).toBe(
      `${reqEnv.APP_URL}/login?error=rate_limited&redirect=%2F`,
    );
  });

  it('callback の超過時は再試行情報を引き継がずにログイン画面へ戻し、auth-session Cookie を残す', async () => {
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(0) });
    const session = JSON.stringify({
      state: 'state',
      redirectUrl: '/shifts',
      inviteToken: 'test-invitation',
      createdAt: Date.now(),
    });
    const res = await app.request(
      '/api/auth/line/callback?code=code&state=state',
      { headers: { cookie: `auth-session=${encodeURIComponent(session)}` } },
      reqEnv,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${reqEnv.APP_URL}/login?error=rate_limited`);
    // Cookie を削除・上書きしないので、招待リンクを開き直せば再開できる
    expect(res.headers.get('set-cookie')).toBeNull();
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
    const res = await app.request(
      '/api/auth/logout',
      { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    // auth-token を即時失効させる（Max-Age=0）
    expect(setCookie).toContain('auth-token=');
    expect(setCookie.toLowerCase()).toContain('max-age=0');
  });
});

/** 認証 Cookie（auth-token）を含む Set-Cookie かを判定する */
function issuesAuthCookie(res: Response): boolean {
  return (res.headers.get('set-cookie') ?? '').includes('auth-token=');
}

/** どの DB 操作にも到達しない D1。到達すれば例外を投げ、認証前に拒否されたことを確かめる */
function unreachableDb(): D1Database {
  return new Proxy(env.DB, {
    get() {
      throw new Error('拒否されるはずのリクエストがDBへ到達しました');
    },
  });
}

describe('JWT の拒否条件（署名・クレーム）', () => {
  const secret = env.JWT_SECRET;

  /** 検証条件のうち 1 つだけを崩したトークンを作る。他の条件は有効にする */
  async function craftToken(
    user: { id: string; displayName: string },
    options: {
      secret?: string;
      alg?: 'HS256' | 'HS384';
      issuer?: string;
      audience?: string;
      /** null で exp を付けない */
      expiresAt?: number | null;
    } = {},
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({
      userId: user.id,
      displayName: user.displayName,
      role: 'ADMIN',
      isActive: true,
      authTime: now,
    })
      .setProtectedHeader({ alg: options.alg ?? 'HS256' })
      .setIssuedAt(now)
      .setIssuer(options.issuer ?? 'fuyugyo')
      .setAudience(options.audience ?? 'fuyugyo-users');
    if (options.expiresAt !== null) jwt.setExpirationTime(options.expiresAt ?? now + 7200);
    return await jwt.sign(new TextEncoder().encode(options.secret ?? secret));
  }

  /** 署名はそのままに、ペイロードだけを別のロールへ書き換える */
  function tamperPayload(token: string): string {
    const [header, payload, signature] = token.split('.');
    const claims: Record<string, unknown> = JSON.parse(
      atob(payload?.replace(/-/g, '+').replace(/_/g, '/') ?? ''),
    );
    const forged = btoa(JSON.stringify({ ...claims, role: 'ADMIN', userId: 'forged-user' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${header}.${forged}.${signature}`;
  }

  it('対照: 条件をすべて満たすトークンは検証と保護APIの両方で受け付ける', async () => {
    const user = await seedUser({ role: 'ADMIN' });
    const token = await craftToken(user);
    expect(await verifyJwt(token, secret)).toMatchObject({ success: true });
    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));
    expect(res.status).toBe(200);
  });

  const cases: Array<[string, (user: { id: string; displayName: string }) => Promise<string>]> = [
    ['署名鍵が異なる', (u) => craftToken(u, { secret: 'another-secret-that-is-long-enough-0000' })],
    ['署名後にペイロードを改ざんした', async (u) => tamperPayload(await craftToken(u))],
    ['issuer が異なる', (u) => craftToken(u, { issuer: 'other-issuer' })],
    ['audience が異なる', (u) => craftToken(u, { audience: 'other-audience' })],
    ['アルゴリズムが HS384', (u) => craftToken(u, { alg: 'HS384' })],
    ['exp がない', (u) => craftToken(u, { expiresAt: null })],
    ['JWT の形式でない文字列', async () => 'not-a-jwt'],
    ['区切りだけの不正形式', async () => '..'],
  ];

  it.each(cases)(
    '%sトークンは verifyJwt が失敗し、保護APIは401で認証Cookieを再発行せずDBにも触れない',
    async (_name, build) => {
      const user = await seedUser({ role: 'ADMIN' });
      const token = await build(user);

      expect(await verifyJwt(token, secret)).toMatchObject({ success: false });
      for (const init of [cookieHeader(token), { headers: { authorization: `Bearer ${token}` } }]) {
        const res = await app.request('/api/auth/me', init, envWith({ DB: unreachableDb() }));
        expect(res.status).toBe(401);
        expect(issuesAuthCookie(res)).toBe(false);
      }
    },
  );

  it('空文字のトークンは verifyJwt が失敗し、空のCookie・Bearerでも保護APIは401でDBに触れない', async () => {
    expect(await verifyJwt('', secret)).toEqual({ success: false, error: 'Token is required' });
    for (const headers of [{ cookie: 'auth-token=' }, { authorization: 'Bearer ' }]) {
      const res = await app.request('/api/auth/me', { headers }, envWith({ DB: unreachableDb() }));
      expect(res.status).toBe(401);
      expect(issuesAuthCookie(res)).toBe(false);
    }
  });
});

describe('GET /api/auth/me（JWT と DB の乖離）', () => {
  it('更新間隔未満のJWTは DB を読み直さないため、削除済みUserは 404 になる', async () => {
    const user = await seedUser();
    const token = await tokenFor(user, 'MEMBER');
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();

    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'User not found' });
  });

  it('更新間隔に到達したJWTは削除済みUserを 401 で拒否し、404 とは区別される', async () => {
    const user = await seedUser();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      userId: user.id,
      displayName: user.displayName,
      role: 'MEMBER',
      isActive: true,
      authTime: now - 900,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 900)
      .setIssuer('fuyugyo')
      .setAudience('fuyugyo-users')
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();

    const res = await app.request('/api/auth/me', cookieHeader(token), envWith({}));
    expect(res.status).toBe(401);
    expect(issuesAuthCookie(res)).toBe(false);
  });
});

describe('招待による新規登録（LINE callback → 実D1）', () => {
  const NEW_LINE_USER = 'invited-line-user';
  const fixedNow = new Date('2026-01-10T00:00:00.000Z');

  /** ログイン開始から callback までを実ルートで通す。LINE への外部通信だけを差し替える */
  async function registerViaLine(options: {
    lineUserId?: string;
    displayName?: string;
    pictureUrl?: string;
    invite?: string | null;
    reqEnv?: Env;
  }) {
    const reqEnv = options.reqEnv ?? envWith({ AUTH_RATE_LIMITER: makeRateLimiter(50) });
    const loginEnv = { ...reqEnv, DB: env.DB };
    const query = new URLSearchParams({ redirect: '/shifts' });
    if (options.invite) query.set('invite', options.invite);
    const login = await app.request(`/api/auth/line/login?${query}`, {}, loginEnv);
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'line-access-token' }))
      .mockResolvedValueOnce(
        Response.json({
          userId: options.lineUserId ?? NEW_LINE_USER,
          displayName: options.displayName ?? '招待ユーザー',
          ...(options.pictureUrl === undefined ? {} : { pictureUrl: options.pictureUrl }),
        }),
      );
    return await app.request(
      `/api/auth/line/callback?code=code&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
      reqEnv,
    );
  }

  /** 登録拒否の応答（302・遷移先 error・認証Cookieなし）を確認する */
  function expectRejected(res: Response, error: string) {
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe(error);
    expect(issuesAuthCookie(res)).toBe(false);
  }

  async function seedInvite(overrides: Partial<typeof invitationTokens.$inferInsert> = {}) {
    const owner = await seedUser({ role: 'ADMIN' });
    const token = `invite-${crypto.randomUUID()}`;
    await createDb(env.DB)
      .insert(invitationTokens)
      .values({
        token,
        createdBy: owner.id,
        expiresAt: new Date(Date.now() + 3600000),
        ...overrides,
      });
    return token;
  }

  async function usedCountOf(token: string): Promise<number> {
    const [row] = await createDb(env.DB)
      .select({ usedCount: invitationTokens.usedCount })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, token));
    return row?.usedCount ?? -1;
  }

  async function usersWithLineId(lineUserId: string): Promise<(typeof users.$inferSelect)[]> {
    return await createDb(env.DB).select().from(users).where(eq(users.lineUserId, lineUserId));
  }

  async function userCount(): Promise<number> {
    const [row] = await createDb(env.DB).select({ value: count() }).from(users);
    return row?.value ?? -1;
  }

  it('招待なしの新規ログインは invitation_required で拒否され、User を作らない', async () => {
    const before = await userCount();
    const res = await registerViaLine({ invite: null });
    expectRejected(res, 'invitation_required');
    expect(await userCount()).toBe(before);
  });

  it('存在しない招待は invitation_invalid で拒否され、User を作らない', async () => {
    await seedUser({ role: 'ADMIN' });
    const before = await userCount();
    const res = await registerViaLine({ invite: 'no-such-token' });
    expectRejected(res, 'invitation_invalid');
    expect(new URL(res.headers.get('location') ?? '').searchParams.get('invite')).toBe(
      'no-such-token',
    );
    expect(await usersWithLineId(NEW_LINE_USER)).toHaveLength(0);
    expect(await userCount()).toBe(before);
  });

  it.each([
    ['無効化済み', { isActive: false }],
    ['期限切れ', { expiresAt: new Date(Date.now() - 1000) }],
    ['上限到達', { maxUses: 2, usedCount: 2 }],
  ])(
    '%sの招待は invitation_invalid で拒否され、User 作成も使用回数加算もしない',
    async (_n, overrides) => {
      const token = await seedInvite(overrides);
      const usedBefore = await usedCountOf(token);
      const before = await userCount();

      const res = await registerViaLine({ invite: token });

      expectRejected(res, 'invitation_invalid');
      expect(await usersWithLineId(NEW_LINE_USER)).toHaveLength(0);
      expect(await userCount()).toBe(before);
      expect(await usedCountOf(token)).toBe(usedBefore);
    },
  );

  it('期限と同時刻の招待は拒否し、1秒前なら受け付ける（境界）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixedNow);
    const atExpiry = await seedInvite({ expiresAt: fixedNow });
    const rejected = await registerViaLine({ invite: atExpiry, lineUserId: 'expiry-user-a' });
    expectRejected(rejected, 'invitation_invalid');
    expect(await usersWithLineId('expiry-user-a')).toHaveLength(0);
    expect(await usedCountOf(atExpiry)).toBe(0);

    const justBefore = await seedInvite({ expiresAt: new Date(fixedNow.getTime() + 1000) });
    const accepted = await registerViaLine({ invite: justBefore, lineUserId: 'expiry-user-b' });
    expect(accepted.status).toBe(302);
    expect(issuesAuthCookie(accepted)).toBe(true);
    expect(await usedCountOf(justBefore)).toBe(1);
  });

  it('有効な招待で MEMBER の User が1件作られ、使用回数が1だけ増え、認証Cookieを発行する', async () => {
    const token = await seedInvite({ maxUses: 5 });

    const res = await registerViaLine({ invite: token });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${env.APP_URL}/shifts`);
    expect(issuesAuthCookie(res)).toBe(true);
    const created = await usersWithLineId(NEW_LINE_USER);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      role: 'MEMBER',
      isActive: true,
      displayName: '招待ユーザー',
      pictureUrl: null,
      instructorId: null,
    });
    expect(await usedCountOf(token)).toBe(1);
  });

  it('pictureUrl 付きのプロフィールで新規登録すると、実D1にその URL が保存される', async () => {
    const token = await seedInvite({ maxUses: 5 });
    const pictureUrl = 'https://profile.line-scdn.net/example/picture';

    const res = await registerViaLine({ invite: token, pictureUrl });

    expect(res.status).toBe(302);
    expect(issuesAuthCookie(res)).toBe(true);
    const created = await usersWithLineId(NEW_LINE_USER);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ pictureUrl, role: 'MEMBER' });
    expect(await usedCountOf(token)).toBe(1);
  });

  it('上限1の招待は1人目の登録後、次の新規登録を拒否する（逐次）', async () => {
    const token = await seedInvite({ maxUses: 1 });

    const first = await registerViaLine({ invite: token, lineUserId: 'first-user' });
    const second = await registerViaLine({ invite: token, lineUserId: 'second-user' });

    expect(first.status).toBe(302);
    expect(issuesAuthCookie(first)).toBe(true);
    expectRejected(second, 'invitation_invalid');
    expect(await usersWithLineId('first-user')).toHaveLength(1);
    expect(await usersWithLineId('second-user')).toHaveLength(0);
    expect(await usedCountOf(token)).toBe(1);
  });

  it('無制限（maxUses なし）の招待は何人でも登録でき、使用回数だけが増える', async () => {
    const token = await seedInvite({ maxUses: null, usedCount: 100 });

    for (const id of ['unlimited-1', 'unlimited-2', 'unlimited-3']) {
      const res = await registerViaLine({ invite: token, lineUserId: id });
      expect(issuesAuthCookie(res)).toBe(true);
    }

    expect(await usedCountOf(token)).toBe(103);
  });

  it('既存Userの再ログインは招待が無効でも成功し、使用回数を消費しない', async () => {
    const token = await seedInvite({ maxUses: 1, usedCount: 1, isActive: false });
    const user = await seedUser({ lineUserId: 'existing-line-user' });

    const res = await registerViaLine({ invite: token, lineUserId: user.lineUserId });

    expect(res.status).toBe(302);
    expect(issuesAuthCookie(res)).toBe(true);
    expect(await usedCountOf(token)).toBe(1);
    expect(await usersWithLineId(user.lineUserId)).toHaveLength(1);
  });

  it('無効なUserは inactive_user で拒否され認証Cookieを出さない（プロフィール追従は従来どおり）', async () => {
    const user = await seedUser({ isActive: false, displayName: '旧表示名' });

    const res = await registerViaLine({
      lineUserId: user.lineUserId,
      displayName: '新表示名',
      invite: null,
    });

    expectRejected(res, 'inactive_user');
    const [after] = await usersWithLineId(user.lineUserId);
    // 既存実装は無効Userでもプロフィールだけは追従してから拒否する。有効状態・ロールは変わらない
    expect(after).toMatchObject({ isActive: false, role: 'MEMBER', displayName: '新表示名' });
  });

  describe('登録の原子性（User 作成と招待消費は同一 batch）', () => {
    it('User 作成が制約違反で失敗すると 500 になり、招待を消費しない', async () => {
      const token = await seedInvite({ maxUses: 3 });
      // 事前確認（User なし）の後・batch の前に、同じ lineUserId の User が別経路で作られた状況
      const interruption = interruptBeforeBatch(env.DB, async () => {
        await createDb(env.DB)
          .insert(users)
          .values({ lineUserId: NEW_LINE_USER, displayName: '競合先に作られたUser' });
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await registerViaLine({
        invite: token,
        reqEnv: envWith({ DB: interruption.db, AUTH_RATE_LIMITER: makeRateLimiter(50) }),
      });

      expect(consoleError).toHaveBeenCalled();
      expect(res.status).toBe(500);
      expect(issuesAuthCookie(res)).toBe(false);
      expect(interruption.interruptCount()).toBe(1);
      const rows = await usersWithLineId(NEW_LINE_USER);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.displayName).toBe('競合先に作られたUser');
      expect(await usedCountOf(token)).toBe(0);
    });

    it('招待の使用回数更新が実DBで失敗すると、作成済みのUserも含めて全体をロールバックする', async () => {
      const token = await seedInvite({ maxUses: 3 });
      // 使用回数の UPDATE だけを実DB側で失敗させる一時トリガー。INSERT は成功してから失敗する
      await env.DB.exec(
        "CREATE TRIGGER test_fail_invitation_update BEFORE UPDATE OF used_count ON invitation_tokens BEGIN SELECT RAISE(ABORT, 'test_forced_update_failure'); END",
      );
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const res = await registerViaLine({ invite: token });

        expect(consoleError).toHaveBeenCalled();
        expect(res.status).toBe(500);
        expect(issuesAuthCookie(res)).toBe(false);
        expect(await usersWithLineId(NEW_LINE_USER)).toHaveLength(0);
        expect(await usedCountOf(token)).toBe(0);
      } finally {
        await env.DB.exec('DROP TRIGGER IF EXISTS test_fail_invitation_update');
      }
      // 後処理の確認: トリガーが残っていなければ同じ招待で正常に登録できる
      const recovered = await registerViaLine({ invite: token });
      expect(issuesAuthCookie(recovered)).toBe(true);
      expect(await usedCountOf(token)).toBe(1);
    });

    it('上限1の招待に別の登録が割り込んでも、登録は最大1件・使用回数は1に収まる', async () => {
      const token = await seedInvite({ maxUses: 1 });
      // 1人目の事前確認後・batch 前に、2人目が同じ招待で先に登録を完了する
      const interruption = interruptBeforeBatch(env.DB, async () => {
        const winner = await registerViaLine({ invite: token, lineUserId: 'race-winner' });
        expect(issuesAuthCookie(winner)).toBe(true);
      });

      const loser = await registerViaLine({
        invite: token,
        lineUserId: 'race-loser',
        reqEnv: envWith({ DB: interruption.db, AUTH_RATE_LIMITER: makeRateLimiter(50) }),
      });

      expect(interruption.interruptCount()).toBe(1);
      expectRejected(loser, 'invitation_invalid');
      expect(await usersWithLineId('race-winner')).toHaveLength(1);
      expect(await usersWithLineId('race-loser')).toHaveLength(0);
      expect(await usedCountOf(token)).toBe(1);
    });
  });
});
