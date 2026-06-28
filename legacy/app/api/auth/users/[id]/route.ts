import type { User } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import type { ApiResponse } from "@/lib/auth/types";
import { getPrisma } from "@/lib/db";

/**
 * 個別ユーザー管理API
 *
 * 機能:
 * - GET: ユーザー詳細取得
 */

// ユーザー詳細レスポンス型
type UserDetailResponse = Pick<
  User,
  "id" | "displayName" | "role" | "isActive" | "createdAt" | "updatedAt"
> & {
  invitationCount: number; // 作成した招待数
};

/**
 * GET /api/auth/users/[id] - ユーザー詳細取得
 *
 * 権限: ADMIN または MANAGER
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<UserDetailResponse>>> {
  try {
    // パラメータ解決
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // 認証チェック
    const authResult = await authenticateFromRequest(request);
    if (!(authResult.success && authResult.user)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // 権限チェック（管理者・マネージャーのみ、または自分自身）
    const isOwnProfile = authResult.user.id === id;
    const hasManagementPermission = ["ADMIN", "MANAGER"].includes(
      authResult.user.role
    );

    if (!(isOwnProfile || hasManagementPermission)) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Insufficient permissions",
        },
        { status: 403 }
      );
    }

    // ユーザー詳細取得
    const user = await (await getPrisma()).user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdInvitations: {
          select: { token: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    const response: UserDetailResponse = {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      invitationCount: user.createdInvitations.length,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
