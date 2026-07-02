import type { CookieOptions } from 'hono/utils/cookie';

/**
 * 認証で用いる Cookie 名と設定。
 * `auth-token` が JWT（ログインセッション本体）、`auth-session` が OAuth state の一時保管。
 */

/** JWT を載せる Cookie 名 */
export const AUTH_COOKIE = 'auth-token';
/** OAuth state を一時保管する Cookie 名 */
export const SESSION_COOKIE = 'auth-session';

/** OAuth state Cookie の有効期間（秒）。認証フロー完了までの短期間のみ */
export const SESSION_MAX_AGE = 10 * 60;

/**
 * JWT Cookie のオプションを返す。
 * `secure` は本番のみ（ローカル HTTP 開発を許容するため）。
 * `sameSite=Lax` は LINE からのトップレベルリダイレクトで Cookie を送るために必要。
 *
 * @param maxAge - 有効期間（秒）。JWT の有効期限と揃える
 * @param isProduction - 本番環境かどうか
 */
export function authCookieOptions(maxAge: number, isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge,
  };
}

/**
 * OAuth state Cookie のオプションを返す。
 *
 * @param isProduction - 本番環境かどうか
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}
