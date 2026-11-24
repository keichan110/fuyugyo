import type { CookieOptions } from 'hono/utils/cookie';

/**
 * 認証で用いる Cookie 名と設定。
 * `auth-token` が JWT（ログインセッション本体）、`auth-session` が OAuth state の一時保管。
 */

/** JWT を載せる Cookie 名 */
export const AUTH_COOKIE = 'auth-token';
/** OAuth state を一時保管する Cookie 名 */
export const SESSION_COOKIE = 'auth-session';
/** 利用申請用の一時 Cookie 名 */
export const ACCESS_REQUEST_COOKIE = 'access-request';

/** 利用申請 Cookie を送る範囲。申請 API 以外には送信しない */
export const ACCESS_REQUEST_COOKIE_PATH = '/api/access-requests';

/**
 * 利用申請フロー識別子の Cookie 名。
 * OAuth 開始ごとに発行し、申請トークンに埋め込んだ値と POST 時に照合する。
 * ログアウトや次の OAuth 開始で値が変わるため、遅れて届いた callback の申請トークンは使えなくなる。
 */
export const ACCESS_REQUEST_FLOW_COOKIE = 'access-request-flow';

/** フロー識別子 Cookie を送る範囲。login・callback・logout・申請 API のすべてが `/api` 配下 */
export const ACCESS_REQUEST_FLOW_COOKIE_PATH = '/api';

/**
 * フロー識別子 Cookie のオプションを返す。
 * 有効期間は OAuth の往復（10 分）と申請トークンの有効期限（10 分）を合わせた 20 分。
 *
 * @param isProduction - 本番環境かどうか
 */
export function accessRequestFlowCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: ACCESS_REQUEST_FLOW_COOKIE_PATH,
    maxAge: 1200,
  };
}

/**
 * 利用申請 Cookie のオプションを返す。有効期間は申請トークンの有効期限（10 分）と揃える。
 *
 * @param isProduction - 本番環境かどうか
 */
export function accessRequestCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: ACCESS_REQUEST_COOKIE_PATH,
    maxAge: 600,
  };
}

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
