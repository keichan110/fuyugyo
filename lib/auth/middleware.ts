import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import {
  clearAuthCookies,
  setAuthCookie as setSecureAuthCookie,
} from "@/lib/utils/cookies";
import type { AuthenticatedUser } from "@/types/actions";
import { verifyJwt } from "./jwt";

/**
 * 認証ミドルウェア
 * JWT検証とユーザー情報取得機能を提供
 */

/**
 * 認証結果の型定義
 */
export type AuthenticationResult = {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
};

/**
 * 権限チェック結果の型定義
 */
export type AuthorizationResult = {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
};

/**
 * 認証ミドルウェアで返却可能なレスポンス型
 *
 * @description
 * withAuth関数のジェネリック型制約として使用。
 * 成功時と失敗時のレスポンス構造を保証する。
 */
export type AuthCompatibleResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };

/**
 * Cookieから認証トークンを取得
 *
 * @returns JWT トークンまたは null
 */
export async function getAuthTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;
    return token || null;
  } catch {
    // Server Component外での呼び出し等でエラーが発生する場合
    return null;
  }
}

/**
 * NextRequestから認証トークンを取得
 * API Routes用のトークン取得
 *
 * @param request - NextRequest オブジェクト
 * @returns JWT トークンまたは null
 */
export function getAuthTokenFromRequest(request: NextRequest): string | null {
  // Cookieからトークンを取得
  const token = request.cookies.get("auth-token")?.value;

  if (token) {
    return token;
  }

  // Authorization ヘッダーからもチェック（オプション）
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    // biome-ignore lint/style/noMagicNumbers: "Bearer "の文字列長
    return authHeader.substring(7);
  }

  return null;
}

/**
 * JWT トークンを検証してユーザー情報を取得
 *
 * @param token - JWT トークン
 * @returns 認証結果
 */
export async function authenticateToken(
  token: string | null
): Promise<AuthenticationResult> {
  if (!token) {
    return {
      success: false,
      error: "Authentication token not found",
      statusCode: 401,
    };
  }

  // JWT検証
  const jwtResult = await verifyJwt(token);
  if (!(jwtResult.success && jwtResult.payload)) {
    return {
      success: false,
      error: jwtResult.error || "Invalid authentication token",
      statusCode: 401,
    };
  }

  try {
    // データベースからユーザー情報を取得
    const user = await (await getPrisma()).user.findUnique({
      where: {
        id: jwtResult.payload.userId,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "User not found",
        statusCode: 401,
      };
    }

    // ユーザーがアクティブかチェック
    if (!user.isActive) {
      return {
        success: false,
        error: "User account is inactive",
        statusCode: 403,
      };
    }

    // LINE ユーザーID の整合性チェック
    if (user.lineUserId !== jwtResult.payload.lineUserId) {
      return {
        success: false,
        error: "Token user ID mismatch",
        statusCode: 401,
      };
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl ?? null,
      role: user.role as "ADMIN" | "MANAGER" | "MEMBER",
      instructorId: user.instructorId,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return {
      success: true,
      user: authenticatedUser,
    };
  } catch (error) {
    return {
      success: false,
      error: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      statusCode: 500,
    };
  }
}

/**
 * Cookieベースの認証チェック
 * Server Components用
 *
 * @returns 認証結果
 */
export async function authenticateFromCookies(): Promise<AuthenticationResult> {
  const token = await getAuthTokenFromCookies();
  return await authenticateToken(token);
}

/**
 * リクエストベースの認証チェック
 * API Routes用
 *
 * @param request - NextRequest オブジェクト
 * @returns 認証結果
 */
export async function authenticateFromRequest(
  request: NextRequest
): Promise<AuthenticationResult> {
  const token = getAuthTokenFromRequest(request);
  return await authenticateToken(token);
}

/**
 * 権限チェック
 * 指定された権限以上のアクセス権限があるかチェック
 *
 * @param user - 認証済みユーザー
 * @param requiredRole - 必要な権限レベル
 * @returns 権限チェック結果
 */
export function checkUserRole(
  user: AuthenticatedUser,
  requiredRole: "ADMIN" | "MANAGER" | "MEMBER"
): AuthorizationResult {
  const roleHierarchy = {
    ADMIN: 3,
    MANAGER: 2,
    MEMBER: 1,
  };

  const userRoleLevel = roleHierarchy[user.role];
  const requiredRoleLevel = roleHierarchy[requiredRole];

  if (userRoleLevel >= requiredRoleLevel) {
    return {
      success: true,
      user,
    };
  }

  return {
    success: false,
    error: `Insufficient permissions. Required: ${requiredRole}, Current: ${user.role}`,
    statusCode: 403,
  };
}

/**
 * 認証＋権限チェック（統合版）
 * トークン検証とロール確認を一度に実行
 *
 * @param token - JWT トークン
 * @param requiredRole - 必要な権限レベル
 * @returns 認証・権限チェック結果
 */
export async function authenticateAndAuthorize(
  token: string | null,
  requiredRole: "ADMIN" | "MANAGER" | "MEMBER" = "MEMBER"
): Promise<AuthorizationResult> {
  const authResult = await authenticateToken(token);

  if (!(authResult.success && authResult.user)) {
    const result: AuthorizationResult = {
      success: false,
    };
    if (authResult.error) {
      result.error = authResult.error;
    }
    if (authResult.statusCode) {
      result.statusCode = authResult.statusCode;
    }
    return result;
  }

  return checkUserRole(authResult.user, requiredRole);
}

/**
 * 型安全なエラーレスポンス生成ヘルパー
 *
 * @description
 * 認証エラー時のNextResponseを型安全に生成します。
 * NextResponse.json()の型定義の制約により型アサーションが必要ですが、
 * この関数内にカプセル化することで影響範囲を局所化しています。
 *
 * @template T - レスポンス型（AuthCompatibleResponseを継承）
 * @param error - エラーメッセージ
 * @param statusCode - HTTPステータスコード
 * @returns 型付きNextResponse
 */
function createAuthErrorResponse<T extends AuthCompatibleResponse>(
  error: string,
  statusCode: number
): NextResponse<T> {
  const errorBody = {
    success: false,
    error,
  } satisfies { success: false; error: string };

  // NOTE: NextResponse.json()の型定義の制約により型アサーション必要
  return NextResponse.json(errorBody, {
    status: statusCode,
  }) as unknown as NextResponse<T>;
}

/**
 * API Route用認証ミドルウェア
 * Next.js API Routesで使用するヘルパー関数
 *
 * @template T - エラーレスポンスの型（AuthCompatibleResponseを継承）
 * @param request - NextRequest オブジェクト
 * @param requiredRole - 必要な権限レベル
 * @returns 認証結果とエラーレスポンス（必要時）
 *
 * @example
 * // 使用例：型パラメータを指定して型安全性を確保
 * const { errorResponse } = await withAuth<ShiftFormDataResponse>(request, "MANAGER");
 * if (errorResponse) {
 *   return errorResponse; // 型アサーション不要
 * }
 */
export async function withAuth<T extends AuthCompatibleResponse>(
  request: NextRequest,
  requiredRole: "ADMIN" | "MANAGER" | "MEMBER" = "MEMBER"
): Promise<{
  result: AuthorizationResult;
  errorResponse?: NextResponse<T>;
}> {
  const token = getAuthTokenFromRequest(request);
  const result = await authenticateAndAuthorize(token, requiredRole);

  if (!result.success) {
    const errorResponse = createAuthErrorResponse<T>(
      result.error || "Authentication failed",
      // biome-ignore lint/style/noMagicNumbers: 標準的なHTTPステータスコード
      result.statusCode || 401
    );
    return { result, errorResponse };
  }

  return { result };
}

/**
 * 認証トークン設定
 * ログイン成功時にCookieにJWTを設定
 *
 * @param token - JWT トークン
 * @returns NextResponse（Cookieヘッダー設定済み）
 */
export function setAuthCookie(token: string): NextResponse {
  const response = NextResponse.json({ success: true });

  setSecureAuthCookie(response, token);

  return response;
}

/**
 * 認証トークン削除
 * ログアウト時にCookieからJWTを削除
 *
 * @returns NextResponse（Cookie削除ヘッダー設定済み）
 */
export function clearAuthCookie(): NextResponse {
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}

/**
 * 現在の認証状態をチェック（デバッグ用）
 * 開発環境でのトラブルシューティング用
 *
 * @param request - NextRequest オブジェクト
 * @returns デバッグ情報
 */
export async function getAuthDebugInfo(request: NextRequest) {
  const token = getAuthTokenFromRequest(request);
  const hasToken = !!token;

  let jwtInfo: {
    valid: boolean;
    payload: { userId: string; role: string; exp?: number | undefined } | null;
    error?: string | undefined;
  } | null = null;
  let dbUser:
    | { id: string; displayName: string; role: string; isActive: boolean }
    | { error: string }
    | null = null;

  if (token) {
    const jwtResult = await verifyJwt(token);
    jwtInfo = {
      valid: jwtResult.success,
      payload: jwtResult.payload
        ? {
            userId: jwtResult.payload.userId,
            role: jwtResult.payload.role,
            exp: jwtResult.payload.exp,
          }
        : null,
      error: jwtResult.error,
    };

    if (jwtResult.success && jwtResult.payload) {
      try {
        dbUser = await (await getPrisma()).user.findUnique({
          where: { id: jwtResult.payload.userId },
          select: {
            id: true,
            displayName: true,
            role: true,
            isActive: true,
          },
        });
      } catch {
        dbUser = { error: "Database query failed" };
      }
    }
  }

  return {
    hasToken,
    // biome-ignore lint/style/noMagicNumbers: デバッグ表示用の文字数制限
    token: token ? `${token.substring(0, 20)}...` : null, // 最初の20文字のみ表示
    jwt: jwtInfo,
    user: dbUser,
  };
}
