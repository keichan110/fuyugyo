import { NextResponse } from "next/server";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_CONFLICT,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_NOT_FOUND,
} from "@/constants/http-status";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getPrisma } from "@/lib/db";

/**
 * トークンパラメータをバリデーションする
 */
export function validateTokenParameter(
  token: string | undefined
):
  | { success: false; response: NextResponse }
  | { success: true; decodedToken: string } {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "Token parameter is required" },
        { status: HTTP_STATUS_BAD_REQUEST }
      ),
    };
  }

  return {
    success: true,
    decodedToken: decodeURIComponent(token.trim()),
  };
}

/**
 * 招待トークンをデータベースから取得する
 */
export async function fetchInvitationToken(decodedToken: string): Promise<
  | {
      success: false;
      response: NextResponse<{ success: false; error: string }>;
    }
  | {
      success: true;
      invitationToken: {
        token: string;
        description: string | null;
        expiresAt: Date;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
        maxUses: number | null;
        usedCount: number;
        creator: {
          id: string;
          displayName: string;
          role: string;
        };
      };
    }
> {
  const invitationToken = await (await getPrisma()).invitationToken.findUnique({
    where: { token: decodedToken },
    include: {
      creator: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
    },
  });

  if (!invitationToken) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "Invitation token not found" },
        { status: HTTP_STATUS_NOT_FOUND }
      ),
    };
  }

  return {
    success: true,
    invitationToken,
  };
}

/**
 * ユーザーがトークンを無効化できる権限を持つかチェックする
 */
export function checkDeactivationPermission(
  user: AuthenticatedUser,
  invitationToken: { createdBy: string }
):
  | {
      success: false;
      response: NextResponse<{ success: false; error: string }>;
    }
  | { success: true } {
  const canDeactivate =
    user.role === "ADMIN" || // 管理者は全ての招待URLを無効化可能
    invitationToken.createdBy === user.id; // 作成者は自分の招待URLを無効化可能

  if (!canDeactivate) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "You can only deactivate invitation tokens you created, or you must be an admin",
        },
        { status: HTTP_STATUS_FORBIDDEN }
      ),
    };
  }

  return { success: true };
}

/**
 * トークンがアクティブかチェックする
 */
export function checkTokenActive(invitationToken: {
  isActive: boolean;
}): { success: false; response: NextResponse } | { success: true } {
  if (!invitationToken.isActive) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "Invitation token is already inactive" },
        { status: HTTP_STATUS_CONFLICT }
      ),
    };
  }

  return { success: true };
}

/**
 * トークンを無効化する
 */
export async function deactivateToken(decodedToken: string) {
  return await (await getPrisma()).invitationToken.update({
    where: { token: decodedToken },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
    include: {
      creator: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
    },
  });
}

/**
 * 削除エラーメッセージを識別する
 */
export function identifyDeletionError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to deactivate invitation token";
  }

  if (error.message.includes("Record to update not found")) {
    return "Invitation token not found or already deleted";
  }

  if (error.message.includes("Unique constraint")) {
    return "Database constraint violation";
  }

  return error.message;
}
