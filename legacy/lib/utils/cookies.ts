/**
 * セキュアなCookie設定ユーティリティ
 * CSRF攻撃対策とセキュリティ強化されたCookie管理
 */

import type { NextResponse } from "next/server";

export type SecureCookieOptions = {
  name: string;
  value: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
};

/**
 * セキュアなCookie設定
 * デフォルトでセキュリティを重視した設定を適用
 */
export function setSecureCookie(
  response: NextResponse,
  options: SecureCookieOptions
) {
  const {
    name,
    value,
    maxAge = 3600, // デフォルト1時間
    path = "/",
    httpOnly = true, // XSS攻撃対策
    secure = process.env.NODE_ENV === "production", // HTTPS必須（本番環境）
    sameSite = "strict", // CSRF攻撃対策（デフォルトでstrictに変更）
  } = options;

  response.cookies.set(name, value, {
    httpOnly,
    secure,
    sameSite,
    maxAge,
    path,
  });
}

/**
 * 認証トークン用のセキュアなCookie設定
 * OAuth/外部IdP認証フローに対応したセキュリティ設定を適用
 */
export function setAuthCookie(response: NextResponse, token: string) {
  setSecureCookie(response, {
    name: "auth-token",
    value: token,
    // biome-ignore lint/style/noMagicNumbers: 時間計算は数式のままが可読性が高い
    maxAge: 48 * 60 * 60, // 48時間（既存の設定に合わせる）
    sameSite: "lax", // OAuth/LINE認証のクロスサイトリダイレクトに対応しつつCSRF対策
    httpOnly: true, // JavaScriptからアクセス不可
    secure: process.env.NODE_ENV === "production", // HTTPS必須
  });
}

/**
 * セッション用のセキュアなCookie設定
 * 短期間の認証セッション用
 */
export function setSessionCookie(response: NextResponse, sessionData: string) {
  setSecureCookie(response, {
    name: "auth-session",
    value: sessionData,
    maxAge: 10 * 60, // 10分間（認証フロー完了まで）
    sameSite: "lax", // 外部IdPリダイレクト後のトップレベル遷移でも送信される必要がある
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * リフレッシュトークン用のセキュアなCookie設定
 * 長期間保存用で最高レベルのセキュリティ
 */
export function setRefreshTokenCookie(
  response: NextResponse,
  refreshToken: string
) {
  setSecureCookie(response, {
    name: "refresh-token",
    value: refreshToken,
    // biome-ignore lint/style/noMagicNumbers: 時間計算は数式のままが可読性が高い
    maxAge: 7 * 24 * 60 * 60, // 7日間
    sameSite: "strict",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 本番環境でのみHTTPS必須
    path: "/api/auth", // 認証API以外からはアクセス不可
  });
}

/**
 * Cookieを安全に削除
 * セキュリティを考慮した削除処理
 *
 * 注意: Cookie削除時は設定時と同じsameSite値を使用する必要がある
 */
export function deleteCookie(
  response: NextResponse,
  name: string,
  path = "/",
  sameSite: "strict" | "lax" = "lax" // auth-tokenはlaxで設定されているため、デフォルトをlaxに変更
) {
  response.cookies.set(name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    maxAge: 0, // 即座に期限切れ
    path,
  });
}

/**
 * 全認証関連Cookieを安全に削除
 * ログアウト時などに使用
 */
export function clearAuthCookies(response: NextResponse) {
  deleteCookie(response, "auth-token", "/", "lax"); // auth-tokenはlaxで設定
  deleteCookie(response, "auth-session", "/", "lax"); // auth-sessionもlaxで設定
  deleteCookie(response, "refresh-token", "/api/auth", "strict"); // refresh-tokenはstrictで設定
}

/**
 * Cookie設定の妥当性チェック
 * 開発時のセキュリティ設定確認用
 */
export function validateCookieOptions(options: SecureCookieOptions): {
  isSecure: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let isSecure = true;

  // SameSite設定チェック
  if (options.sameSite !== "strict" && options.sameSite !== "lax") {
    warnings.push('SameSite should be "strict" or "lax" for CSRF protection');
    isSecure = false;
  }

  // HttpOnly設定チェック
  if (options.httpOnly === false) {
    warnings.push("HttpOnly should be true to prevent XSS attacks");
    isSecure = false;
  }

  // Secure設定チェック（本番環境）
  if (process.env.NODE_ENV === "production" && options.secure === false) {
    warnings.push("Secure flag should be true in production environment");
    isSecure = false;
  }

  // 有効期限チェック（認証トークン）
  if (
    options.name.includes("token") &&
    options.maxAge &&
    // biome-ignore lint/style/noMagicNumbers: 時間計算は数式のままが可読性が高い
    options.maxAge >= 48 * 60 * 60
  ) {
    warnings.push(
      "Auth tokens should have shorter expiration time (max 48 hours)"
    );
  }

  return {
    isSecure,
    warnings,
  };
}
