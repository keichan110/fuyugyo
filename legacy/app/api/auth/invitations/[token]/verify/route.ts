import { type NextRequest, NextResponse } from "next/server";
import {
  TOKEN_MASK_MIN_LENGTH,
  TOKEN_MASK_PREFIX_LENGTH,
  TOKEN_MASK_SUFFIX_LENGTH,
} from "@/constants/auth";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_GONE,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
} from "@/constants/http-status";
import { validateInvitationToken } from "@/lib/auth/invitations";
import type { ApiResponse, InvitationValidationData } from "@/lib/auth/types";
import { secureAuthLog, secureLog } from "@/lib/utils/logging";
import { getClientIp, getRequestUserAgent } from "@/lib/utils/request";

/**
 * 招待URL検証API
 *
 * GET /api/auth/invitations/[token]/verify
 * - 認証不要（招待URL確認のため）
 * - 招待URLの有効性を確認する
 * - 有効期限・使用回数チェック
 *
 * @example
 * ```bash
 * curl -X GET http://localhost:3000/api/auth/invitations/inv_abc123/verify
 * ```
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
): Promise<NextResponse<ApiResponse<InvitationValidationData>>> {
  const clientIp = getClientIp(request);
  const userAgent = getRequestUserAgent(request);
  const maskTokenValue = (value: string): string => {
    if (value.length <= TOKEN_MASK_MIN_LENGTH) {
      return "****";
    }
    return `${value.substring(0, TOKEN_MASK_PREFIX_LENGTH)}...${value.substring(value.length - TOKEN_MASK_SUFFIX_LENGTH)}`;
  };
  let maskedToken = "(unavailable)";

  try {
    const { token } = await context.params;

    // トークンパラメータの基本チェック
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Token parameter is required" },
        { status: HTTP_STATUS_BAD_REQUEST }
      );
    }

    // URL デコード（必要に応じて）
    const decodedToken = decodeURIComponent(token.trim());
    maskedToken = maskTokenValue(decodedToken);

    secureAuthLog("Invitation token verification attempt", {
      maskedToken,
      ip: clientIp,
      userAgent,
    });

    // 招待トークン検証実行
    const validationResult = await validateInvitationToken(decodedToken);

    if (validationResult.isValid) {
      // 有効なトークンの場合
      const responseData: InvitationValidationData = {
        isValid: true,
      };

      secureAuthLog("Invitation token verification succeeded", {
        maskedToken,
        ip: clientIp,
        userAgent,
        hasMetadata: Boolean(validationResult.token),
      });

      return NextResponse.json(
        { success: true, data: responseData },
        { status: HTTP_STATUS_OK }
      );
    }
    // 無効なトークンの場合
    let statusCode = HTTP_STATUS_BAD_REQUEST; // デフォルトは400

    // エラーコードに応じてステータスコードを調整
    switch (validationResult.errorCode) {
      case "NOT_FOUND":
        statusCode = HTTP_STATUS_NOT_FOUND;
        break;
      case "EXPIRED":
      case "INACTIVE":
      case "MAX_USES_EXCEEDED":
        statusCode = HTTP_STATUS_GONE; // Gone - リソースは存在していたが現在は利用不可
        break;
      default:
        statusCode = HTTP_STATUS_BAD_REQUEST;
    }

    secureLog("warn", "Invitation token verification rejected", {
      maskedToken,
      error: validationResult.error,
      errorCode: validationResult.errorCode,
      statusCode,
      ip: clientIp,
      userAgent,
    });

    const errorMessage = validationResult.error || "Invalid invitation token";
    const errorResponse: ApiResponse<InvitationValidationData> = {
      success: false,
      error: errorMessage,
    };

    return NextResponse.json(errorResponse, { status: statusCode });
  } catch (error) {
    secureLog("error", "Invitation token verification error", {
      maskedToken,
      ip: clientIp,
      userAgent,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    let errorMessage = "Failed to verify invitation token";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}
