import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { AUTH_COOKIE } from '@/server/auth/cookies';
import { verifyJwt, type JwtPayload, type UserRole } from '@/server/auth/jwt';
import { hasMinimumRole } from '@/server/auth/roles';
import type { Env } from '@/server/types';

/**
 * 認証ミドルウェア（ADR 0003）。旧 `authenticateFromRequest`/`withAuth` の二重化を解消し、
 * Hono のチェーンに一本化する。検証は JWT クレームのみで完結し、DB ルックアップは行わない
 * （無効化・ロール変更の反映は最大 12h 遅延、ADR 0003 で許容）。
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
 * 未認証・無効トークン・非アクティブは 401 を投げる（中央 `onError` が整形する）。
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

  c.set('user', result.payload);
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
