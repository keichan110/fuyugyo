import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { AUTH_COOKIE, authCookieOptions } from '@/server/auth/cookies';
import { signJwt, verifyJwt, type JwtPayload, type UserRole } from '@/server/auth/jwt';
import { durationToSeconds, hasMinimumRole } from '@/server/auth/roles';
import { toJwtPayload } from '@/server/auth/user';
import { createDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import type { Env } from '@/server/types';

/**
 * 認証ミドルウェア（ADR 0003）。旧 `authenticateFromRequest`/`withAuth` の二重化を解消し、
 * Hono のチェーンに一本化する。通常は JWT のみで検証し、更新間隔に達した際に
 * DB のユーザー情報を読み直して再発行する。初回ログインからの絶対期限は毎回検証する。
 */

/** ミドルウェアが `c.var.user` に載せる認証済みユーザー型 */
export type AuthUser = JwtPayload;

/** 認証ミドルウェアが設定する Hono Variables */
export type AuthVariables = {
  user: AuthUser;
};

/** リクエストから JWT を取り出す（Cookie 優先、なければ Authorization ヘッダ） */
function extractToken(c: Context): string | null {
  const cookieToken = getCookie(c, AUTH_COOKIE);
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  return null;
}

/**
 * 認証必須ミドルウェア。JWT を検証し `c.var.user` にペイロードを設定する。
 * 未認証・無効トークン・期限切れは 401、非アクティブは 403 を投げる。
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const result = await verifyJwt(token, c.env.JWT_SECRET);
  if (!result.success) {
    throw new HTTPException(401, { message: result.error });
  }

  if (!result.payload.isActive) {
    throw new HTTPException(403, { message: 'User account is inactive' });
  }

  const { payload } = result;
  const now = Math.floor(Date.now() / 1000);
  if (now - payload.authTime >= durationToSeconds(c.env.JWT_ABSOLUTE_EXPIRES_IN)) {
    throw new HTTPException(401, { message: 'Session has expired' });
  }

  let user: AuthUser = payload;
  if (now - payload.iat >= durationToSeconds(c.env.JWT_REFRESH_INTERVAL)) {
    const db = createDb(c.env.DB);
    const [record] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!record) {
      throw new HTTPException(401, { message: 'User not found' });
    }
    if (!record.isActive) {
      throw new HTTPException(403, { message: 'User account is inactive' });
    }

    // 最新の権限をこのリクエストの後段にも適用し、初回ログイン時刻は延長しない。
    user = toJwtPayload(record);
    const token = await signJwt(user, c.env.JWT_SECRET, c.env.JWT_EXPIRES_IN, payload.authTime);
    setCookie(
      c,
      AUTH_COOKIE,
      token,
      authCookieOptions(
        durationToSeconds(c.env.JWT_EXPIRES_IN),
        c.env.APP_URL.startsWith('https://'),
      ),
    );
  }

  c.set('user', user);
  await next();
});

/**
 * ロール必須ミドルウェアを生成する。`requireAuth` の後段で使い、
 * `c.var.user.role` が `required` 以上であることを強制する（不足時 403）。
 *
 * @param required - 要求する最低ロール（ADMIN/MANAGER/MEMBER）
 */
export function requireRole(required: UserRole) {
  return createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user');
    if (!hasMinimumRole(user.role, required)) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required: ${required}`,
      });
    }
    await next();
  });
}
