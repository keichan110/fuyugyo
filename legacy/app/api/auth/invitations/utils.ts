import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_UNAUTHORIZED,
} from "@/constants/http-status";
import { checkUserRole } from "@/lib/auth/middleware";
import type {
  AuthenticatedUser,
  AuthenticationResult,
  InvitationListItem,
} from "@/lib/auth/types";
import { getPrisma } from "@/lib/db";

/**
 * 認証とロールチェックの結果型
 */
type AuthCheckResult =
  | { success: true; user: AuthenticatedUser }
  | {
      success: false;
      response: NextResponse<{ success: false; error: string }>;
    };

/**
 * 認証とロールチェックを実行するヘルパー関数
 */
export function checkAuthAndRole(
  authResult: AuthenticationResult,
  requiredRole: "ADMIN" | "MANAGER" | "MEMBER" = "MANAGER"
): AuthCheckResult {
  if (!(authResult.success && authResult.user)) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: authResult.error ?? "Authentication required",
        },
        { status: authResult.statusCode ?? HTTP_STATUS_UNAUTHORIZED }
      ),
    };
  }

  const roleResult = checkUserRole(authResult.user, requiredRole);

  if (!(roleResult.success && roleResult.user)) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            roleResult.error ??
            "Insufficient permissions. Admin or Manager role required.",
        },
        { status: roleResult.statusCode ?? HTTP_STATUS_FORBIDDEN }
      ),
    };
  }

  return { success: true, user: roleResult.user };
}

/**
 * リクエストボディのバリデーションスキーマ
 */
export const createInvitationSchema = z.object({
  description: z.string().optional(),
  expiresAt: z.string(), // 必須 - ISO 8601形式の日付文字列
});

export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>;

/**
 * リクエストボディを解析してバリデーションする
 */
export async function parseAndValidateRequest(request: NextRequest): Promise<
  | { success: true; data: CreateInvitationRequest }
  | {
      success: false;
      response: NextResponse<{ success: false; error: string }>;
    }
> {
  try {
    const body = await request.json();
    const data = createInvitationSchema.parse(body);
    return { success: true, data };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Invalid request body. Expected: { description?: string, expiresAt: string }",
        },
        { status: HTTP_STATUS_BAD_REQUEST }
      ),
    };
  }
}

/**
 * 有効期限のバリデーション結果型
 */
type ExpiryValidationResult =
  | { success: true; expiresAt: Date }
  | {
      success: false;
      response: NextResponse<{ success: false; error: string }>;
    };

/**
 * 有効期限をバリデーションする（最大1ヶ月）
 */
export function validateExpiry(
  expiresAtString: string
): ExpiryValidationResult {
  const expiresAt = new Date(expiresAtString);
  const maxExpiryDate = new Date();
  maxExpiryDate.setMonth(maxExpiryDate.getMonth() + 1);

  if (expiresAt > maxExpiryDate) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "有効期限は最大1ヶ月までです" },
        { status: HTTP_STATUS_BAD_REQUEST }
      ),
    };
  }

  if (expiresAt <= new Date()) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "有効期限は現在時刻より後に設定してください" },
        { status: HTTP_STATUS_BAD_REQUEST }
      ),
    };
  }

  return { success: true, expiresAt };
}

/**
 * 招待トークン一覧を取得する
 */
export async function fetchInvitationTokens(
  userId: string,
  userRole: "ADMIN" | "MANAGER" | "MEMBER",
  includeInactive: boolean,
  showAll: boolean
) {
  if (showAll && userRole === "ADMIN") {
    // 全ユーザーの招待トークンを取得（管理者のみ）
    return await (await getPrisma()).invitationToken.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
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
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // 自分が作成した招待トークンのみ取得（マネージャーの場合も含む）
  const { getInvitationTokensByCreator } = await import(
    "@/lib/auth/invitations"
  );
  return await getInvitationTokensByCreator(userId, includeInactive);
}

/**
 * トークンからレスポンスデータを構築する
 */
export function buildInvitationListResponse(
  tokens: Array<{
    token: string;
    description: string | null;
    expiresAt: Date;
    isActive: boolean;
    maxUses: number | null;
    usedCount: number;
    createdAt: Date;
    creator: {
      id: string;
      displayName: string;
      role: string;
    };
  }>
): InvitationListItem[] {
  const now = new Date();

  return tokens.map((token) => {
    const isExpired = token.expiresAt <= now;
    const remainingUses = token.maxUses
      ? token.maxUses - token.usedCount
      : null;

    return {
      token: token.token,
      description: token.description || "",
      expiresAt: token.expiresAt.toISOString(),
      isActive: token.isActive,
      maxUses: token.maxUses,
      usedCount: token.usedCount,
      createdAt: token.createdAt.toISOString(),
      createdBy: token.creator.id,
      creatorName: token.creator.displayName,
      creatorRole: token.creator.role,
      isExpired,
      remainingUses,
    };
  });
}

/**
 * 特定のエラーメッセージを識別する
 */
export function identifyErrorMessage(
  error: unknown,
  defaultMessage: string
): string {
  if (!(error instanceof Error)) {
    return defaultMessage;
  }

  if (error.message.includes("Invalid user ID")) {
    return "User not found or inactive";
  }

  if (error.message.includes("Insufficient permissions")) {
    return "Insufficient permissions to create invitations";
  }

  if (error.message.includes("Failed to generate unique")) {
    return "System error: Unable to generate unique invitation token";
  }

  return error.message;
}
