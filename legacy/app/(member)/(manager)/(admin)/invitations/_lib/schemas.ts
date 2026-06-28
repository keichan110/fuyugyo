import { z } from "zod";

/**
 * 招待作成スキーマ
 *
 * 管理者・マネージャーが新規ユーザーを招待するためのトークンを生成します。
 * トークンは有効期限と使用回数制限を持ちます。
 */
export const createInvitationSchema = z.object({
  /**
   * 招待の説明（任意）
   * 招待の目的や対象者を記録するために使用します
   */
  description: z.string().optional(),

  /**
   * 有効期限（ISO 8601形式の日時文字列）
   * 省略時はデフォルトで7日後に設定されます
   */
  expiresAt: z.string().datetime().optional(),

  /**
   * 最大使用回数（任意）
   * null の場合は無制限
   */
  maxUses: z.number().int().positive().optional().nullable(),

  /**
   * 招待されたユーザーに付与するロール
   * デフォルトは MEMBER
   */
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
});

/**
 * 招待受諾スキーマ
 *
 * ユーザーが招待URLから登録する際に使用します。
 * LINE認証経由で取得した情報と招待トークンを組み合わせます。
 */
export const acceptInvitationSchema = z.object({
  /**
   * 招待トークン（URLパラメータから取得）
   */
  token: z.string().min(1, "Token is required"),

  /**
   * LINE User ID（LINE認証から取得）
   */
  lineUserId: z.string().min(1, "LINE User ID is required"),

  /**
   * 表示名（LINE認証から取得）
   */
  displayName: z.string().min(1, "Display name is required"),

  /**
   * プロフィール画像URL（LINE認証から取得、任意）
   */
  pictureUrl: z.string().url().optional().nullable(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
