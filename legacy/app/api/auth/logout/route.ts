import { type NextRequest, NextResponse } from "next/server";
import {
  authenticateFromRequest,
  getAuthTokenFromRequest,
} from "@/lib/auth/middleware";
import { clearAuthCookies, deleteCookie } from "@/lib/utils/cookies";

/**
 * ログアウトAPI
 * JWTクッキーの削除とユーザーセッションの終了
 *
 * POST /api/auth/logout
 * GET /api/auth/logout
 *
 * Headers (Optional):
 * - Authorization: Bearer <JWT> - 認証トークン
 * - Cookie: auth-token=<JWT> - 認証クッキー
 *
 * Response:
 * - 200 OK: ログアウト成功（Cookieクリア済み）
 * - 302 Redirect: リダイレクト先指定時
 */

/**
 * POST /api/auth/logout
 * ログアウト処理（推奨）
 */
export async function POST(request: NextRequest) {
  try {
    // 現在の認証状態を確認（ログ出力用）
    const token = getAuthTokenFromRequest(request);
    let _currentUser: { id: string; displayName: string } | null = null;

    if (token) {
      const authResult = await authenticateFromRequest(request);
      if (authResult.success && authResult.user) {
        _currentUser = authResult.user;
      }
    }

    // レスポンス作成
    const response = NextResponse.json(
      {
        success: true,
        message: "Logged out successfully",
      },
      { status: 200 }
    );

    // 全認証関連Cookieを安全に削除
    clearAuthCookies(response);

    return response;
  } catch {
    // エラーが発生してもCookieは削除する
    const response = NextResponse.json(
      {
        success: true, // UXの観点からエラーでもログアウトは成功として扱う
        message: "Logged out successfully",
        warning: "Logout completed with minor issues",
      },
      { status: 200 }
    );

    // Cookieクリア
    // 認証Cookieを安全に削除
    clearAuthCookies(response);

    // auth-sessionも統一ユーティリティで削除
    deleteCookie(response, "auth-session");

    return response;
  }
}

/**
 * GET /api/auth/logout
 * ログアウト処理（GETリクエスト対応）
 * クエリパラメータでリダイレクト先を指定可能
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const redirectTo = searchParams.get("redirect") || "/";

    // 現在の認証状態を確認（ログ出力用）
    const token = getAuthTokenFromRequest(request);
    let _currentUser: { id: string; displayName: string } | null = null;

    if (token) {
      const authResult = await authenticateFromRequest(request);
      if (authResult.success && authResult.user) {
        _currentUser = authResult.user;
      }
    }

    // リダイレクト先の検証（セキュリティ対策）
    let finalRedirectUrl = "/";
    try {
      const redirectUrl = new URL(redirectTo, request.url);
      // 同一オリジンのみ許可
      if (redirectUrl.origin === new URL(request.url).origin) {
        finalRedirectUrl = redirectUrl.pathname + redirectUrl.search;
      }
      // else: 異なるオリジンの場合はデフォルトの "/" を使用
    } catch {
      // 無効なURL形式の場合はデフォルトの "/" を使用
    }

    // リダイレクトレスポンス作成
    const response = NextResponse.redirect(
      new URL(finalRedirectUrl, request.url),
      {
        status: 302,
      }
    );

    // 認証Cookieの削除
    // 認証Cookieを安全に削除
    clearAuthCookies(response);

    // auth-sessionも統一ユーティリティで削除
    deleteCookie(response, "auth-session");

    return response;
  } catch {
    // エラーが発生してもルートにリダイレクトしてCookieをクリア
    const response = NextResponse.redirect(new URL("/", request.url), {
      status: 302,
    });

    // 認証Cookieを安全に削除
    clearAuthCookies(response);

    // auth-sessionも統一ユーティリティで削除
    deleteCookie(response, "auth-session");

    return response;
  }
}

/**
 * DELETE /api/auth/logout
 * RESTful な DELETE メソッドでのログアウト処理
 */
export async function DELETE(request: NextRequest) {
  try {
    // POST処理と同様の処理
    const token = getAuthTokenFromRequest(request);
    let _currentUser: { id: string; displayName: string } | null = null;

    if (token) {
      const authResult = await authenticateFromRequest(request);
      if (authResult.success && authResult.user) {
        _currentUser = authResult.user;
      }
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "Authentication session deleted successfully",
      },
      { status: 200 }
    );

    // Cookieクリア
    // 認証Cookieを安全に削除
    clearAuthCookies(response);

    // auth-sessionも統一ユーティリティで削除
    deleteCookie(response, "auth-session");

    return response;
  } catch {
    const response = NextResponse.json(
      {
        success: true,
        message: "Authentication session deleted successfully",
        warning: "Logout completed with minor issues",
      },
      { status: 200 }
    );

    // 認証Cookieを安全に削除
    clearAuthCookies(response);

    // auth-sessionも統一ユーティリティで削除
    deleteCookie(response, "auth-session");

    return response;
  }
}

/**
 * OPTIONS /api/auth/logout
 * CORS対応
 */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
