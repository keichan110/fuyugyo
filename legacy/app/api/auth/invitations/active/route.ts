import { type NextRequest, NextResponse } from "next/server";
import {
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from "@/constants/http-status";
import { authenticateFromRequest, checkUserRole } from "@/lib/auth/middleware";
import type { ApiResponse } from "@/lib/auth/types";
import { getPrisma } from "@/lib/db";

/**
 * 有効な招待チェックAPI
 * GET /api/auth/invitations/active
 */
export async function GET(request: NextRequest): Promise<
  NextResponse<
    ApiResponse<{
      token: string;
      description: string;
      expiresAt: Date;
      isActive: boolean;
      maxUses: number | null;
      usageCount: number;
      remainingUses: number | null;
      createdAt: Date;
      createdBy: string;
    }>
  >
> {
  try {
    const authResult = await authenticateFromRequest(request);
    if (!(authResult.success && authResult.user)) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error ?? "Authentication required",
        },
        { status: authResult.statusCode ?? HTTP_STATUS_UNAUTHORIZED }
      );
    }

    const roleResult = checkUserRole(authResult.user, "MANAGER");
    if (!(roleResult.success && roleResult.user)) {
      return NextResponse.json(
        {
          success: false,
          error:
            roleResult.error ??
            "Insufficient permissions. Admin or Manager role required.",
        },
        { status: roleResult.statusCode ?? HTTP_STATUS_FORBIDDEN }
      );
    }

    const now = new Date();

    const activeInvitation = await (
      await getPrisma()
    ).invitationToken.findFirst({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!activeInvitation) {
      return NextResponse.json(
        { success: false, error: "No active invitation found" },
        { status: HTTP_STATUS_NOT_FOUND }
      );
    }

    const responseData = {
      token: activeInvitation.token,
      description: activeInvitation.description || "",
      expiresAt: activeInvitation.expiresAt,
      isActive: activeInvitation.isActive,
      maxUses: activeInvitation.maxUses,
      usageCount: activeInvitation.usedCount,
      remainingUses: activeInvitation.maxUses
        ? activeInvitation.maxUses - activeInvitation.usedCount
        : null,
      createdAt: activeInvitation.createdAt,
      createdBy: activeInvitation.creator.displayName,
    };

    return NextResponse.json(
      { success: true, data: responseData },
      { status: HTTP_STATUS_OK }
    );
  } catch (error) {
    let errorMessage = "Failed to check active invitation";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}
