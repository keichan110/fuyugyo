import { type NextRequest, NextResponse } from "next/server";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from "@/constants/http-status";
import { DISPLAY_NAME_MAX_LENGTH } from "@/constants/validation";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import type { AuthenticatedUser } from "@/types/actions";

/**
 * ユーザー情報取得API
 * 認証されたユーザーの詳細情報を取得する
 *
 * GET /api/auth/me
 *
 * Headers (Required):
 * - Cookie: auth-token=<JWT> - 認証トークン
 * or
 * - Authorization: Bearer <JWT> - 認証トークン
 *
 * Response:
 * - 200 OK: ユーザー情報取得成功
 * - 401 Unauthorized: 認証失敗（トークン無効・未認証）
 * - 403 Forbidden: アカウント無効
 * - 500 Internal Server Error: システムエラー
 */

/**
 * ユーザー情報レスポンス型
 */
export type UserInfoResponse = {
  success: true;
  user: AuthenticatedUser;
};

/**
 * エラーレスポンス型
 */
export type ErrorResponse = {
  success: false;
  error: string;
  statusCode?: number;
};

/**
 * GET /api/auth/me
 * 認証されたユーザーの情報を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証トークンの検証とユーザー情報取得
    const authResult = await authenticateFromRequest(request);

    if (!(authResult.success && authResult.user)) {
      const response: ErrorResponse = {
        success: false,
        error: authResult.error || "Authentication failed",
        ...(authResult.statusCode && { statusCode: authResult.statusCode }),
      };

      return NextResponse.json(response, {
        status: authResult.statusCode || HTTP_STATUS_UNAUTHORIZED,
      });
    }

    const user = authResult.user;

    // ユーザー情報レスポンス
    const response: UserInfoResponse = {
      success: true,
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl ?? null,
        role: user.role,
        instructorId: user.instructorId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };

    return NextResponse.json(response, { status: HTTP_STATUS_OK });
  } catch {
    const response: ErrorResponse = {
      success: false,
      error: "Failed to retrieve user information",
      statusCode: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    };

    return NextResponse.json(response, {
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    });
  }
}

/**
 * POST /api/auth/me
 * ユーザー情報の部分更新（表示名のみ更新可能）
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authResult = await authenticateFromRequest(request);

    if (!(authResult.success && authResult.user)) {
      const response: ErrorResponse = {
        success: false,
        error: authResult.error || "Authentication failed",
        ...(authResult.statusCode && { statusCode: authResult.statusCode }),
      };

      return NextResponse.json(response, {
        status: authResult.statusCode || HTTP_STATUS_UNAUTHORIZED,
      });
    }

    // リクエストボディの解析
    let requestData: { displayName?: string } = {};
    try {
      const body = await request.text();
      if (body.trim()) {
        requestData = JSON.parse(body);
      }
    } catch (_parseError) {
      const response: ErrorResponse = {
        success: false,
        error: "Invalid request body format",
        statusCode: HTTP_STATUS_BAD_REQUEST,
      };
      return NextResponse.json(response, { status: HTTP_STATUS_BAD_REQUEST });
    }

    // 表示名の更新のみ許可
    if (
      !requestData.displayName ||
      typeof requestData.displayName !== "string"
    ) {
      const response: ErrorResponse = {
        success: false,
        error: "Display name is required and must be a string",
        statusCode: HTTP_STATUS_BAD_REQUEST,
      };
      return NextResponse.json(response, { status: HTTP_STATUS_BAD_REQUEST });
    }

    // 表示名の長さ制限
    if (
      requestData.displayName.trim().length === 0 ||
      requestData.displayName.length > DISPLAY_NAME_MAX_LENGTH
    ) {
      const response: ErrorResponse = {
        success: false,
        error: "Display name must be between 1 and 50 characters",
        statusCode: HTTP_STATUS_BAD_REQUEST,
      };
      return NextResponse.json(response, { status: HTTP_STATUS_BAD_REQUEST });
    }

    const user = authResult.user;
    const newDisplayName = requestData.displayName.trim();

    // 同じ表示名の場合は更新をスキップ
    if (user.displayName === newDisplayName) {
      const response: UserInfoResponse = {
        success: true,
        user,
      };
      return NextResponse.json(response, { status: HTTP_STATUS_OK });
    }

    // データベースの動的インポート（Prismaクライアント）
    const { getPrisma } = await import("@/lib/db");

    // 表示名を更新
    const updatedUser = await (await getPrisma()).user.update({
      where: { id: user.id },
      data: { displayName: newDisplayName },
    });

    // 更新されたユーザー情報をレスポンス型に変換
    const updatedAuthUser: AuthenticatedUser = {
      id: updatedUser.id,
      lineUserId: updatedUser.lineUserId,
      displayName: updatedUser.displayName,
      pictureUrl: updatedUser.pictureUrl ?? null,
      role: updatedUser.role as "ADMIN" | "MANAGER" | "MEMBER",
      instructorId: updatedUser.instructorId,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };

    const response: UserInfoResponse = {
      success: true,
      user: updatedAuthUser,
    };

    return NextResponse.json(response, { status: HTTP_STATUS_OK });
  } catch {
    const response: ErrorResponse = {
      success: false,
      error: "Failed to update user information",
      statusCode: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    };

    return NextResponse.json(response, {
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    });
  }
}

export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
    "https://localhost:3000",
  ].filter(Boolean); // undefined環境変数を除去

  if (!(origin && allowedOrigins.includes(origin))) {
    return new NextResponse(null, { status: HTTP_STATUS_FORBIDDEN });
  }

  return new NextResponse(null, {
    status: HTTP_STATUS_OK,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
