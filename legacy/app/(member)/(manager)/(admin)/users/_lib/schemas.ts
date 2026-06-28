import { z } from "zod";

/**
 * ユーザー作成スキーマ（管理者用）
 *
 * 注意: ユーザー作成は通常、招待システム経由で行われます。
 * このスキーマは管理者が直接ユーザーを作成する場合の特殊ケースです。
 */
export const createUserSchema = z.object({
  lineUserId: z.string().min(1, "LINE User ID is required"),
  displayName: z.string().min(1, "Display name is required"),
  pictureUrl: z.string().url().optional().nullable(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
});

/**
 * ユーザー更新スキーマ
 *
 * 更新可能フィールド:
 * - displayName: 表示名
 * - role: ユーザー権限（ADMIN, MANAGER, MEMBER）
 * - isActive: アクティブ状態
 *
 * 制限:
 * - lineUserId は変更不可（ユニーク識別子のため）
 */
export const updateUserSchema = z
  .object({
    displayName: z.string().min(1, "Display name is required").optional(),
    role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * ユーザー削除は論理削除（isActive を false に設定）のみ
 * スキーマは不要（IDのみで削除可能）
 */

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
