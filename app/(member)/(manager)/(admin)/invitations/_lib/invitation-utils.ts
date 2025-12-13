import type { InvitationTokenWithStats } from "./types";

/**
 * 招待が期限切れかどうかを判定
 *
 * @param invitation - 判定対象の招待
 * @returns 期限切れの場合true、期限なしまたは期限内の場合false
 */
export function isInvitationExpired(
  invitation: InvitationTokenWithStats
): boolean {
  if (!invitation.expiresAt) {
    return false;
  }
  return new Date(invitation.expiresAt).getTime() < Date.now();
}

/**
 * 招待が有効かどうかを判定（アクティブかつ期限内）
 *
 * @param invitation - 判定対象の招待
 * @returns 有効な場合true、無効または期限切れの場合false
 */
export function isInvitationValid(
  invitation: InvitationTokenWithStats
): boolean {
  return invitation.isActive && !isInvitationExpired(invitation);
}

/**
 * 招待のステータスラベルを取得
 *
 * @param invitation - ステータスを取得する招待
 * @returns ステータスラベル（"有効" | "期限切れ" | "無効"）
 */
export function getInvitationStatusLabel(
  invitation: InvitationTokenWithStats
): "有効" | "期限切れ" | "無効" {
  if (!invitation.isActive) {
    return "無効";
  }
  if (isInvitationExpired(invitation)) {
    return "期限切れ";
  }
  return "有効";
}
