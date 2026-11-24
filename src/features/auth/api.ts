import { and, eq, gte } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { accessRequestCutoff } from '@/features/access-requests/constants';
import { signAccessRequestToken } from '@/server/auth/access-request-token';
import {
  ACCESS_REQUEST_COOKIE,
  accessRequestCookieOptions,
  AUTH_COOKIE,
  authCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/server/auth/cookies';
import { signJwt } from '@/server/auth/jwt';
import {
  buildLineAuthUrl,
  exchangeCodeForToken,
  fetchLineUserProfile,
  generateState,
  validateState,
  type LineConfig,
  type LineUserProfile,
} from '@/server/auth/line';
import { durationToSeconds } from '@/server/auth/roles';
import { toJwtPayload, toUserRole } from '@/server/auth/user';
import { createDb, type Database } from '@/server/db/client';
import { accessRequests, users } from '@/server/db/schema';
import { requireAuth, type AuthVariables } from '@/server/middleware/auth';
import { rateLimit } from '@/server/middleware/rate-limit';
import { captureServerError } from '@/server/sentry';
import type { Env } from '@/server/types';

/**
 * 認証 feature の Hono ルート。
 * LINE OAuth による login → callback で JWT を発行し、logout・/me を提供する。
 * 認証系（login/callback）は CF Rate Limit を適用する。
 */

/** 本番環境かどうかを APP_URL から判定する（HTTPS なら本番扱い） */
function isProduction(env: Env): boolean {
  return env.APP_URL.startsWith('https://');
}

/** `c.env` から LINE 設定を組み立てる */
function lineConfig(env: Env): LineConfig {
  return {
    channelId: env.LINE_CHANNEL_ID,
    channelSecret: env.LINE_CHANNEL_SECRET,
    callbackUrl: `${env.APP_URL}/api/auth/line/callback`,
  };
}

/** OAuth フロー中に一時保管するセッション情報 */
const authSessionSchema = z.object({
  state: z.string().min(1),
  inviteToken: z.string().optional(),
  redirectUrl: z.string(),
  createdAt: z.number().int().nonnegative(),
});

type AuthSession = z.infer<typeof authSessionSchema>;

/** Open Redirect を防ぐため、アプリ内パス（先頭が `/`）のみ許可する */
function safeRedirectPath(value: string | undefined): string {
  if (!value || value.startsWith('//') || value.includes('://')) {
    return '/';
  }
  return value.startsWith('/') ? value : '/';
}

/** ログインページへエラー付きでリダイレクトする URL を作る */
function loginErrorUrl(
  env: Env,
  reason: string,
  retry?: { redirectUrl: string; inviteToken: string | undefined },
): string {
  const params = new URLSearchParams({ error: reason });
  if (retry) {
    params.set('redirect', safeRedirectPath(retry.redirectUrl));
    if (retry.inviteToken) params.set('invite', retry.inviteToken);
  }
  return `${env.APP_URL}/login?${params.toString()}`;
}

/** User レコードから `/me` 系レスポンス（MeResponse 形）を作る */
function toMeResponse(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl,
    role: toUserRole(user.role),
    instructorId: user.instructorId,
    isActive: user.isActive,
  };
}

/**
 * LINE プロフィールに一致する既存 User を取得する。
 * 表示名・画像に変更があれば追従して更新する。未登録なら null を返す（新規 User は作らない）。
 */
async function findUserAndSyncProfile(
  db: Database,
  profile: LineUserProfile,
): Promise<typeof users.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, profile.userId))
    .limit(1);
  if (!existing) {
    return null;
  }

  const nextPicture = profile.pictureUrl ?? null;
  if (existing.displayName !== profile.displayName || existing.pictureUrl !== nextPicture) {
    const [updated] = await db
      .update(users)
      .set({ displayName: profile.displayName, pictureUrl: nextPicture })
      .where(eq(users.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  return existing;
}

/**
 * 未登録の LINE ユーザーを利用申請の流れへ誘導する。
 * 期限内の申請があれば承認待ち画面へ、なければ申請 Cookie を発行して申請画面へ 302 で送る。
 * どちらもログイン Cookie は発行せず、OAuth state の Cookie は削除する。
 */
async function redirectUnregistered(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  db: Database,
  profile: LineUserProfile,
): Promise<Response> {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });

  // 期限切れの申請は未申請と同じ扱いにする（行の削除は申請 API が行う）
  const [pending] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.lineUserId, profile.userId),
        gte(accessRequests.requestedAt, accessRequestCutoff(new Date())),
      ),
    )
    .limit(1);
  if (pending) {
    return c.redirect(`${c.env.APP_URL}/access-request/pending`, 302);
  }

  const requestToken = await signAccessRequestToken(
    {
      userId: profile.userId,
      displayName: profile.displayName,
      ...(profile.pictureUrl ? { pictureUrl: profile.pictureUrl } : {}),
    },
    c.env.JWT_SECRET,
  );
  setCookie(
    c,
    ACCESS_REQUEST_COOKIE,
    requestToken,
    accessRequestCookieOptions(isProduction(c.env)),
  );
  return c.redirect(`${c.env.APP_URL}/access-request`, 302);
}

/**
 * login 用の Rate Limit。ページ遷移で開かれるため、超過時は 429 JSON ではなくログイン画面へ戻す。
 * 再試行で招待と戻り先を保持できるよう、クエリの `redirect`・`invite` を引き継ぐ。
 */
const loginRateLimit = rateLimit('login', {
  onLimited: (c) =>
    c.redirect(
      loginErrorUrl(c.env, 'rate_limited', {
        redirectUrl: safeRedirectPath(c.req.query('redirect')),
        inviteToken: c.req.query('invite') || undefined,
      }),
      302,
    ),
});

/**
 * callback 用の Rate Limit。超過時はログイン画面へ戻す。
 * state 検証前のため戻り先・招待は引き継がない（`session_expired` などと同じ扱い）。
 * auth-session Cookie は触らずに残す。
 */
const callbackRateLimit = rateLimit('callback', {
  onLimited: (c) => c.redirect(loginErrorUrl(c.env, 'rate_limited'), 302),
});

export const authRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /**
   * LINE 認証フローを開始する。CSRF 用 state を発行して Cookie に保管し、
   * LINE 認証画面へリダイレクトする。Rate Limit 適用（未認証の攻撃面）。
   */
  .get('/line/login', loginRateLimit, (c) => {
    const inviteToken = c.req.query('invite') || undefined;
    const redirectUrl = safeRedirectPath(c.req.query('redirect'));
    const state = generateState();

    const session: AuthSession = {
      state,
      redirectUrl,
      createdAt: Date.now(),
      ...(inviteToken ? { inviteToken } : {}),
    };
    setCookie(
      c,
      SESSION_COOKIE,
      JSON.stringify(session),
      sessionCookieOptions(isProduction(c.env)),
    );

    const authUrl = buildLineAuthUrl(lineConfig(c.env), state, inviteToken);
    return c.redirect(authUrl, 302);
  })
  /**
   * LINE 認証コールバック。state を検証し、コード交換 → プロフィール取得 →
   * User の取得/作成 → JWT 発行 → Cookie 設定の順に処理する。
   * Rate Limit 適用。失敗時はログインページへエラー付きリダイレクトする。
   */
  .get('/line/callback', callbackRateLimit, async (c) => {
    const code = c.req.query('code');
    const receivedState = c.req.query('state');
    if (!receivedState) {
      return c.redirect(loginErrorUrl(c.env, 'auth_failed'), 302);
    }

    // セッション Cookie（state）の検証
    const rawSession = getCookie(c, SESSION_COOKIE);
    if (!rawSession) {
      return c.redirect(loginErrorUrl(c.env, 'session_expired'), 302);
    }
    let session: AuthSession;
    try {
      session = authSessionSchema.parse(JSON.parse(rawSession));
    } catch {
      return c.redirect(loginErrorUrl(c.env, 'invalid_session'), 302);
    }

    const stateCheck = validateState(receivedState, session.state);
    if (!stateCheck.isValid) {
      return c.redirect(loginErrorUrl(c.env, 'invalid_state'), 302);
    }

    // state を検証できた場合だけ、元の戻り先と招待情報を再試行へ引き継ぐ。
    const retry = {
      redirectUrl: session.redirectUrl,
      inviteToken: session.inviteToken ?? stateCheck.inviteToken,
    };
    if (c.req.query('error') !== undefined || !code) {
      return c.redirect(loginErrorUrl(c.env, 'auth_failed', retry), 302);
    }

    // コード交換 → プロフィール取得（LINE への外部呼び出し）
    let profile: LineUserProfile | null;
    try {
      const accessToken = await exchangeCodeForToken(lineConfig(c.env), code);
      if (!accessToken) {
        return c.redirect(loginErrorUrl(c.env, 'token_exchange_failed', retry), 302);
      }
      profile = await fetchLineUserProfile(accessToken);
    } catch (error) {
      captureServerError(error);
      return c.redirect(loginErrorUrl(c.env, 'auth_failed', retry), 302);
    }
    if (!profile) {
      return c.redirect(loginErrorUrl(c.env, 'profile_fetch_failed', retry), 302);
    }

    // 既存 User はプロフィールに追従してログインさせ、未登録なら利用申請へ進める
    const db = createDb(c.env.DB);
    const user = await findUserAndSyncProfile(db, profile);
    if (!user) {
      return await redirectUnregistered(c, db, profile);
    }
    if (!user.isActive) {
      return c.redirect(loginErrorUrl(c.env, 'inactive_user', retry), 302);
    }

    // JWT 発行 → Cookie に載せてログインセッションとする
    const token = await signJwt(toJwtPayload(user), c.env.JWT_SECRET, c.env.JWT_EXPIRES_IN);
    const maxAge = durationToSeconds(c.env.JWT_EXPIRES_IN);
    setCookie(c, AUTH_COOKIE, token, authCookieOptions(maxAge, isProduction(c.env)));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });

    const redirectPath = safeRedirectPath(session.redirectUrl);
    return c.redirect(`${c.env.APP_URL}${redirectPath}`, 302);
  })
  /** ログアウト。JWT Cookie を破棄してログインセッションを終了する */
  .post('/logout', (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/' });
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true } as const);
  })
  /**
   * 現在ログイン中の User とロールを返す（/me 相当）。
   * `requireAuth` で JWT を検証し、最新の User 情報を D1 から取得して返す。
   */
  .get('/me', requireAuth, async (c) => {
    const { userId } = c.get('user');
    const db = createDb(c.env.DB);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      return c.json({ message: 'User not found' }, 404);
    }

    return c.json(toMeResponse(user));
  });
