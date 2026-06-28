import { type NextRequest, NextResponse } from "next/server";
import { TOKEN_PREVIEW_LENGTH } from "@/constants/auth";
import { validateInvitationToken } from "@/lib/auth/invitations";
import { getPrisma } from "@/lib/db";
import { secureLog } from "@/lib/utils/logging";

export type AuthSession = {
  state: string;
  createdAt: number;
  inviteToken?: string | undefined;
  redirectUrl?: string | undefined;
};

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string | undefined;
};

/**
 * エラーメッセージを安全に解決する
 */
export function resolveErrorMessage(
  error: unknown,
  fallback = "Unknown error"
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return fallback;
}

/**
 * セッションデータをパースする
 */
export function parseSessionData(
  sessionCookie: string
): { success: true; data: AuthSession } | { success: false; error: string } {
  try {
    const sessionData = JSON.parse(sessionCookie);
    return { success: true, data: sessionData };
  } catch {
    return {
      success: false,
      error: "Invalid authentication session data format",
    };
  }
}

/**
 * セッションの有効期限をチェックする
 */
export function validateSessionAge(
  sessionData: AuthSession,
  maxAge: number
): { isValid: true } | { isValid: false; error: string } {
  const sessionAge = Date.now() - sessionData.createdAt;
  if (sessionAge > maxAge) {
    return { isValid: false, error: "Authentication session expired" };
  }
  return { isValid: true };
}

/**
 * 招待トークンのエラーコードからエラー理由を取得する
 */
export function getInvitationErrorReason(
  errorCode: string | undefined
): string {
  if (errorCode === "EXPIRED") {
    return "invitation_expired";
  }
  if (errorCode === "MAX_USES_EXCEEDED") {
    return "invitation_exhausted";
  }
  if (errorCode === "INACTIVE") {
    return "invitation_inactive";
  }
  return "invitation_invalid";
}

/**
 * 既存ユーザーのプロフィール更新が必要かチェックして更新する
 */
export async function updateUserProfileIfNeeded(
  user: {
    id: string;
    displayName: string;
    pictureUrl: string | null;
    lineUserId: string;
    role: string;
    instructorId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  profile: LineProfile
) {
  const needsUpdate =
    user.displayName !== profile.displayName ||
    user.pictureUrl !== (profile.pictureUrl || null);

  if (!needsUpdate) {
    return user;
  }

  const updatedUser = await (await getPrisma()).user.update({
    where: { id: user.id },
    data: {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || null,
    },
  });

  secureLog("info", "Updated user profile (display name and/or image)");
  return updatedUser;
}

/**
 * 招待トークンを検証する
 */
export async function validateInvitation(
  inviteToken: string | undefined
): Promise<
  | { isValid: true }
  | { isValid: false; errorReason: string; errorMessage: string }
> {
  if (!inviteToken) {
    return {
      isValid: false,
      errorReason: "invitation_required",
      errorMessage: "New user registration requires invitation token",
    };
  }

  const tokenValidation = await validateInvitationToken(inviteToken);
  if (!tokenValidation.isValid) {
    const errorReason = getInvitationErrorReason(tokenValidation.errorCode);
    return {
      isValid: false,
      errorReason,
      errorMessage: "Invalid invitation token",
    };
  }

  return { isValid: true };
}

/**
 * 新規ユーザーを作成する
 */
export async function createNewUser(profile: LineProfile, inviteToken: string) {
  const user = await (await getPrisma()).user.create({
    data: {
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || null,
      role: "MEMBER",
      isActive: true,
    },
  });

  secureLog("info", "New user created via invitation", {
    id: user.id,
    role: user.role,
    inviteToken: `${inviteToken.substring(0, TOKEN_PREVIEW_LENGTH)}...`,
  });

  return user;
}

/**
 * エラーリダイレクトレスポンスを作成する
 */
export function createErrorRedirect(
  request: NextRequest,
  reason: string
): NextResponse {
  return NextResponse.redirect(
    new URL(`/error?reason=${reason}`, request.url),
    {
      status: 302,
    }
  );
}
