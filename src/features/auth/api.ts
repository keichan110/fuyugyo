import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import {
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
import { invitationTokens, users } from '@/server/db/schema';
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
 * 招待を消費して新規 User を作成する。User 作成と使用回数の加算は同一 `db.batch` で原子的に行い、
 * どちらかが失敗すれば両方ロールバックする（失敗した登録で招待を消費しない）。
 *
 * 1. INSERT ... SELECT（Drizzle が列順の完全一致を要求するため全列を明示する）の WHERE に招待の有効条件（アクティブ・期限内・上限未満）を置き、
 *    有効な場合に限り、新規 ID の User を MEMBER として作成する。無効なら 0 行で何も作られない。
 * 2. 続く UPDATE は、この新規 ID の User が実在する場合に限り `used_count` を加算する。
 *
 * 判定と書き込みを DB 側の単一 batch に閉じ込め、事前 SELECT とのレースを避ける。
 * 制約違反などの DB 例外はそのまま投げ、中央の `onError` で 500 とする。
 *
 * @returns 作成した User。招待が無効で作成されなかった場合は null
 */
async function createUserWithInvitation(
  db: Database,
  profile: LineUserProfile,
  token: string,
): Promise<typeof users.$inferSelect | null> {
  const newUserId = crypto.randomUUID();
  const now = new Date();
  const [inserted] = await db.batch([
    db
      .insert(users)
      .select(
        db
          .select({
            id: sql<string>`${newUserId}`.as('id'),
            lineUserId: sql<string>`${profile.userId}`.as('line_user_id'),
            displayName: sql<string>`${profile.displayName}`.as('display_name'),
            pictureUrl: sql<string | null>`${profile.pictureUrl ?? null}`.as('picture_url'),
            role: sql<string>`'MEMBER'`.as('role'),
            isActive: sql<boolean>`1`.as('is_active'),
            instructorId: sql<string | null>`NULL`.as('instructor_id'),
            // 招待者として、リンク作成者を新規ユーザーへ転記する（作成者が削除済みなら null）
            invitedBy: sql<string | null>`${invitationTokens.createdBy}`.as('invited_by'),
            createdAt: sql<Date>`unixepoch()`.as('created_at'),
            updatedAt: sql<Date>`unixepoch()`.as('updated_at'),
          })
          .from(invitationTokens)
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
          ),
      )
      .returning(),
    db
      .update(invitationTokens)
      .set({ usedCount: sql`${invitationTokens.usedCount} + 1` })
      .where(
        and(
          eq(invitationTokens.token, token),
          sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${newUserId})`,
        ),
      ),
  ]);
  return inserted[0] ?? null;
}

/** LINE プロフィールから User を取得、なければ招待検証のうえ作成する */
async function getOrCreateUser(
  db: Database,
  profile: LineUserProfile,
  inviteToken: string | undefined,
): Promise<{ ok: true; user: typeof users.$inferSelect } | { ok: false; reason: string }> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, profile.userId))
    .limit(1);

  if (existing) {
    // 表示名・画像に変更があれば追従する
    const nextPicture = profile.pictureUrl ?? null;
    if (existing.displayName !== profile.displayName || existing.pictureUrl !== nextPicture) {
      const [updated] = await db
        .update(users)
        .set({ displayName: profile.displayName, pictureUrl: nextPicture })
        .where(eq(users.id, existing.id))
        .returning();
      return { ok: true, user: updated ?? existing };
    }
    return { ok: true, user: existing };
  }

  // 新規 User は有効な招待トークン必須
  if (!inviteToken) {
    return { ok: false, reason: 'invitation_required' };
  }
  const created = await createUserWithInvitation(db, profile, inviteToken);
  if (!created) {
    return { ok: false, reason: 'invitation_invalid' };
  }
  return { ok: true, user: created };
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
 * auth-session Cookie は触らずに残すので、招待リンクを開き直せば再開できる。
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

    // User 取得/作成（招待トークンは session 由来を優先）
    const db = createDb(c.env.DB);
    const result = await getOrCreateUser(db, profile, retry.inviteToken);
    if (!result.ok) {
      return c.redirect(loginErrorUrl(c.env, result.reason, retry), 302);
    }
    if (!result.user.isActive) {
      return c.redirect(loginErrorUrl(c.env, 'inactive_user', retry), 302);
    }

    // JWT 発行 → Cookie に載せてログインセッションとする
    const token = await signJwt(toJwtPayload(result.user), c.env.JWT_SECRET, c.env.JWT_EXPIRES_IN);
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
