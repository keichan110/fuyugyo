import { validateInvitationToken } from "@/lib/auth/invitations";

/**
 * 招待トークン解析結果
 */
export type InviteTokenResolution = {
  /** 招待トークンが存在するか */
  hasInvite: boolean;
  /** 有効な招待トークン（検証済み） */
  inviteToken: string | null;
  /** トークンが無効な場合のエラー種別 */
  errorType?: "invalid" | "expired" | "inactive";
};

/**
 * サーバー側で招待トークンを解析・検証
 *
 * @param inviteParam - searchParams から取得した invite パラメータ
 * @returns 招待トークン解析結果
 *
 * @example
 * ```typescript
 * const params = await searchParams;
 * const result = await resolveInviteToken(params.invite);
 *
 * if (result.hasInvite && !result.inviteToken) {
 *   // 無効なトークン → エラーページへリダイレクト
 *   redirect('/auth/error?error=invitation_required');
 * }
 * ```
 */
export async function resolveInviteToken(
  inviteParam: string | string[] | undefined
): Promise<InviteTokenResolution> {
  // パラメータが存在しない場合
  if (!inviteParam) {
    return {
      hasInvite: false,
      inviteToken: null,
    };
  }

  // 配列の場合は最初の要素を使用
  const token = Array.isArray(inviteParam) ? inviteParam[0] : inviteParam;

  // 空文字列チェック
  if (!token || token.trim().length === 0) {
    return {
      hasInvite: false,
      inviteToken: null,
    };
  }

  // トークン検証
  const validationResult = await validateInvitationToken(token.trim());

  if (validationResult.isValid) {
    return {
      hasInvite: true,
      inviteToken: token.trim(),
    };
  }

  // 無効なトークンの場合、エラー種別を返す
  let errorType: "invalid" | "expired" | "inactive" = "invalid";

  if (validationResult.errorCode === "EXPIRED") {
    errorType = "expired";
  } else if (validationResult.errorCode === "INACTIVE") {
    errorType = "inactive";
  }

  return {
    hasInvite: true,
    inviteToken: null,
    errorType,
  };
}
