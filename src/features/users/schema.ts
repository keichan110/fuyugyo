import { z } from 'zod';

/**
 * User feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** ユーザーロール（ADMIN > MANAGER > MEMBER） */
export const userRoleSchema = z.enum(['ADMIN', 'MANAGER', 'MEMBER']);
export type UserRole = z.infer<typeof userRoleSchema>;

/** User の単一レコード */
export const userSchema = z.object({
  id: z.string(),
  lineUserId: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().nullable(),
  role: userRoleSchema,
  isActive: z.boolean(),
  /** リンクされた Instructor の ID（未リンクなら null） */
  instructorId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

/** User 一覧レスポンス */
export const userListSchema = z.array(userSchema);

/** ロール変更リクエスト */
export const changeRoleSchema = z.object({
  role: userRoleSchema,
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/** Instructor リンクリクエスト */
export const linkInstructorSchema = z.object({
  instructorId: z.string().min(1),
});

export type LinkInstructorInput = z.infer<typeof linkInstructorSchema>;
