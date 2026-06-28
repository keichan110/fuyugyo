import { type NextRequest, NextResponse } from "next/server";
import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_OK,
} from "@/constants/http-status";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import type { ApiResponse, InvitationListItem } from "@/lib/auth/types";
import {
  buildInvitationListResponse,
  checkAuthAndRole,
  fetchInvitationTokens,
  identifyErrorMessage,
} from "./utils";

/**
 * 招待URL一覧取得API
 *
 * GET /api/auth/invitations
 * - 管理者・マネージャーのみアクセス可能
 * - 作成した招待URL一覧を取得
 *
 * @example
 * ```bash
 * curl -X GET http://localhost:3000/api/auth/invitations \
 *   -H "Authorization: Bearer <JWT_TOKEN>"
 * ```
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<InvitationListItem[]>>> {
  try {
    // 認証とロールチェック
    const authResult = await authenticateFromRequest(request);
    const authCheck = checkAuthAndRole(authResult, "MANAGER");

    if (!authCheck.success) {
      return authCheck.response;
    }

    const user = authCheck.user;

    // クエリパラメータの解析
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const showAll =
      user.role === "ADMIN" && searchParams.get("showAll") === "true";

    // 招待トークン一覧取得
    const tokens = await fetchInvitationTokens(
      user.id,
      user.role,
      includeInactive,
      showAll
    );

    // レスポンスデータの構築
    const invitationList = buildInvitationListResponse(tokens);

    const responseData: ApiResponse<InvitationListItem[]> = {
      success: true,
      data: invitationList,
    };

    return NextResponse.json(responseData, { status: HTTP_STATUS_OK });
  } catch (error) {
    const errorMessage = identifyErrorMessage(
      error,
      "Failed to retrieve invitation tokens"
    );

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}
