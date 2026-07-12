import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import {
  AUTH_COOKIE,
  authCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/server/auth/cookies';
import { signJwt, VALID_ROLES, type JwtPayload, type UserRole } from '@/server/auth/jwt';
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
import { createDb, type Database } from '@/server/db/client';
import { isUniqueViolation } from '@/server/db/errors';
import { instructors, invitationTokens, users } from '@/server/db/schema';
import { requireAuth, type AuthVariables } from '@/server/middleware/auth';
import { rateLimit } from '@/server/middleware/rate-limit';
import type { Env } from '@/server/types';

import { linkInstructorSchema } from './schema';

/**
 * 認証 feature の Hono ルート（ADR 0003/0004）。
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
type AuthSession = {
  state: string;
  inviteToken?: string;
  redirectUrl: string;
  createdAt: number;
};

/** Open Redirect を防ぐため、アプリ内パス（先頭が `/`）のみ許可する */
function safeRedirectPath(value: string | undefined): string {
  if (!value || value.startsWith('//') || value.includes('://')) {
    return '/';
  }
  return value.startsWith('/') ? value : '/';
}

/** ログインページへエラー付きでリダイレクトする URL を作る */
function loginErrorUrl(env: Env, reason: string): string {
  return `${env.APP_URL}/login?error=${encodeURIComponent(reason)}`;
}

/** DB の role 文字列を UserRole に絞り込む（不正値は MEMBER 扱い） */
function toUserRole(role: string): UserRole {
  return VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : 'MEMBER';
}

/** User レコードから `/me` 系レスポンス（MeResponse 形）を作る */
function toMeResponse(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl,
    role: toUserRole(user.role),
    instructorId: user.instructorId,
    isActive: user.isActive,
  };
}

/** User レコードから JWT ペイロードを作る */
function toJwtPayload(user: {
  id: string;
  lineUserId: string;
  displayName: string;
  role: string;
  isActive: boolean;
}): JwtPayload {
  return {
    userId: user.id,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    role: toUserRole(user.role),
    isActive: user.isActive,
  };
}

/**
 * 招待トークンを検証して使用回数を1つ消費する（新規 User 作成時のみ）。
 * 有効（アクティブ・期限内・上限未満）な場合に限り `used_count` を条件付きで加算し、
 * 加算できた（=有効だった）かどうかを返す。read-then-write レースは条件付き UPDATE に寄せる。
 *
 * @returns 招待が有効で消費できたら true
 */
async function consumeInvitation(db: Database, token: string): Promise<boolean> {
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
  const consumed = await consumeInvitation(db, inviteToken);
  if (!consumed) {
    return { ok: false, reason: 'invitation_invalid' };
  }

  const [created] = await db
    .insert(users)
    .values({
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
      role: 'MEMBER',
      isActive: true,
    })
    .returning();

  if (!created) {
    return { ok: false, reason: 'user_creation_failed' };
  }
  return { ok: true, user: created };
}

export const authRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /**
   * LINE 認証フローを開始する。CSRF 用 state を発行して Cookie に保管し、
   * LINE 認証画面へリダイレクトする。Rate Limit 適用（未認証の攻撃面）。
   */
  .get('/line/login', rateLimit('login'), (c) => {
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
   * User の取得/作成 → JWT 発行（12h）→ Cookie 設定の順に処理する。
   * Rate Limit 適用。失敗時はログインページへエラー付きリダイレクトする。
   */
  .get('/line/callback', rateLimit('callback'), async (c) => {
    const code = c.req.query('code');
    const receivedState = c.req.query('state');
    if (c.req.query('error') || !(code && receivedState)) {
      return c.redirect(loginErrorUrl(c.env, 'auth_failed'), 302);
    }

    // セッション Cookie（state）の検証
    const rawSession = getCookie(c, SESSION_COOKIE);
    if (!rawSession) {
      return c.redirect(loginErrorUrl(c.env, 'session_expired'), 302);
    }
    let session: AuthSession;
    try {
      session = JSON.parse(rawSession) as AuthSession;
    } catch {
      return c.redirect(loginErrorUrl(c.env, 'invalid_session'), 302);
    }

    const stateCheck = validateState(receivedState, session.state);
    if (!stateCheck.isValid) {
      return c.redirect(loginErrorUrl(c.env, 'invalid_state'), 302);
    }

    // コード交換 → プロフィール取得（LINE への外部呼び出し）
    const accessToken = await exchangeCodeForToken(lineConfig(c.env), code);
    if (!accessToken) {
      return c.redirect(loginErrorUrl(c.env, 'token_exchange_failed'), 302);
    }
    const profile = await fetchLineUserProfile(accessToken);
    if (!profile) {
      return c.redirect(loginErrorUrl(c.env, 'profile_fetch_failed'), 302);
    }

    // User 取得/作成（招待トークンは session 由来を優先）
    const db = createDb(c.env.DB);
    const inviteToken = session.inviteToken ?? stateCheck.inviteToken;
    const result = await getOrCreateUser(db, profile, inviteToken);
    if (!result.ok) {
      return c.redirect(loginErrorUrl(c.env, result.reason), 302);
    }
    if (!result.user.isActive) {
      return c.redirect(loginErrorUrl(c.env, 'inactive_user'), 302);
    }

    // JWT 発行（12h）→ Cookie に載せてログインセッションとする
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
  })
  /**
   * 自分自身を Instructor にリンクする（セルフサービス・ロール制限なし）。
   * インストラクター紐付けは信頼ベースとし、任意の Instructor を選択できる。
   * `users.instructor_id` の UNIQUE 制約により、既に他ユーザーがリンク済みの
   * Instructor を選ぶと 409 になる（管理者向け `/api/users/:id/link-instructor` と同ロジック）。
   */
  .post(
    '/me/link-instructor',
    requireAuth,
    validator('json', (value, c) => {
      const parsed = linkInstructorSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const { userId } = c.get('user');

      const [instructor] = await db
        .select({ id: instructors.id })
        .from(instructors)
        .where(eq(instructors.id, input.instructorId))
        .limit(1);

      if (!instructor) {
        throw new HTTPException(404, { message: 'Instructor not found' });
      }

      try {
        const [updated] = await db
          .update(users)
          .set({ instructorId: input.instructorId })
          .where(eq(users.id, userId))
          .returning();

        if (!updated) {
          throw new HTTPException(500, { message: 'Failed to link instructor' });
        }
        return c.json(toMeResponse(updated));
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, {
            message: 'This instructor is already linked to another user',
          });
        }
        throw err;
      }
    },
  )
  /** 自分自身の Instructor リンクを解除する（セルフサービス） */
  .delete('/me/link-instructor', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const { userId } = c.get('user');

    const [existing] = await db
      .select({ id: users.id, instructorId: users.instructorId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    if (existing.instructorId === null) {
      throw new HTTPException(409, { message: 'User is not linked to any instructor' });
    }

    const [updated] = await db
      .update(users)
      .set({ instructorId: null })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to unlink instructor' });
    }
    return c.json(toMeResponse(updated));
  });
