import { env } from 'cloudflare:test';
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
  ) {
    return new SignJWT({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      ...(authTime === null ? {} : { authTime }),
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
    expect(await verifyJwt(token, retry.reqEnv.JWT_SECRET)).toMatchObject({
      success: true,
      payload: { lineUserId: 'retry-user' },
    });
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
    expect(verified).toMatchObject({
      success: true,
      payload: { lineUserId: 'new-line-user', role: 'MEMBER' },
    });
    const claims = decodeJwt(token);
    expect(claims.authTime).toBe(claims.iat);
    expect(claims.exp).toBe(Number(claims.iat) + 7200);
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

describe('POST /api/auth/me/link-instructor', () => {
  it('未認証は 401 を返す', async () => {
    const instructorId = await seedInstructor();
    const res = await app.request(
      '/api/auth/me/link-instructor',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorId }),
      },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it('本人を任意の Instructor にセルフサービスでリンクできる（ロール制限なし）', async () => {
    const user = await seedUser({ role: 'MEMBER' });
    const token = await tokenFor(user, 'MEMBER');
    const instructorId = await seedInstructor();

    const res = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const body = meResponseSchema.parse(await res.json());
    expect(body.instructorId).toBe(instructorId);
  });

  it('1 Instructor に複数 User をリンクしようとすると 409（UNIQUE 制約違反）', async () => {
    const user1 = await seedUser({ displayName: 'ユーザーA' });
    const user2 = await seedUser({ displayName: 'ユーザーB' });
    const token1 = await tokenFor(user1, 'MEMBER');
    const token2 = await tokenFor(user2, 'MEMBER');
    const instructorId = await seedInstructor();

    const res1 = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token1, { instructorId }) },
      envWith({}),
    );
    expect(res1.status).toBe(200);

    const res2 = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token2, { instructorId }) },
      envWith({}),
    );
    expect(res2.status).toBe(409);
  });

  it('存在しない Instructor へのリンクは 404 を返す', async () => {
    const user = await seedUser();
    const token = await tokenFor(user, 'MEMBER');

    const res = await app.request(
      '/api/auth/me/link-instructor',
      {
        method: 'POST',
        ...cookieJsonRequest(token, { instructorId: 'nonexistent-instructor-id' }),
      },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/auth/me/link-instructor', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'DELETE', headers: { 'sec-fetch-site': 'same-origin' } },
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it('リンク済みの本人は解除でき、再度別の Instructor へリンクできる', async () => {
    const user = await seedUser();
    const token = await tokenFor(user, 'MEMBER');
    const instructorId = await seedInstructor('山田', '太郎');

    const linkRes = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token, { instructorId }) },
      envWith({}),
    );
    expect(linkRes.status).toBe(200);

    const unlinkRes = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'DELETE', ...cookieHeader(token) },
      envWith({}),
    );
    expect(unlinkRes.status).toBe(200);
    const unlinkBody = meResponseSchema.parse(await unlinkRes.json());
    expect(unlinkBody.instructorId).toBeNull();

    const otherInstructorId = await seedInstructor('鈴木', '次郎');
    const relinkRes = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'POST', ...cookieJsonRequest(token, { instructorId: otherInstructorId }) },
      envWith({}),
    );
    expect(relinkRes.status).toBe(200);
    const relinkBody = meResponseSchema.parse(await relinkRes.json());
    expect(relinkBody.instructorId).toBe(otherInstructorId);
  });

  it('未リンクの本人が解除しようとすると 409 を返す', async () => {
    const user = await seedUser();
    const token = await tokenFor(user, 'MEMBER');

    const res = await app.request(
      '/api/auth/me/link-instructor',
      { method: 'DELETE', ...cookieHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(409);
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
