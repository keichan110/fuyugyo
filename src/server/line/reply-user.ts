import { eq } from 'drizzle-orm';

import { VALID_ROLES } from '@/server/auth/jwt';
import type { Database } from '@/server/db/client';
import { users } from '@/server/db/schema';

/** LINE の返信で業務情報を受け取れるユーザー */
export type LineReplyUser = {
  /** 紐付いたインストラクター。未紐付けは null */
  instructorId: string | null;
};

/**
 * 署名検証済みの LINE ユーザー ID から、返信を許可するユーザーを解決する。
 * Webhook にはログインセッションがないため、最新の D1 で有効状態とロールを確認する。
 *
 * @param db - Drizzle の DB クライアント
 * @param lineUserId - 署名検証済みイベントの送信者の LINE ユーザー ID
 * @returns 有効で既知のロールを持つユーザー。未登録・無効・未知のロールは `null`
 */
export async function findLineReplyUser(
  db: Database,
  lineUserId: string,
): Promise<LineReplyUser | null> {
  const [user] = await db
    .select({ role: users.role, isActive: users.isActive, instructorId: users.instructorId })
    .from(users)
    .where(eq(users.lineUserId, lineUserId))
    .limit(1);
  // 未知のロールは MEMBER に読み替えず、返信しない
  if (!user?.isActive || !VALID_ROLES.some((role) => role === user.role)) return null;
  return { instructorId: user.instructorId };
}
