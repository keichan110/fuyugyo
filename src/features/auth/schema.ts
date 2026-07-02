import { z } from 'zod';

/**
 * 認証 feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** ユーザーロール（ADMIN > MANAGER > MEMBER） */
export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'MEMBER']);

export type Role = z.infer<typeof roleSchema>;

/** `GET /api/auth/me` のレスポンス契約。現在ログイン中の User を表す */
export const meResponseSchema = z.object({
  id: z.string(),
  lineUserId: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().nullable(),
  role: roleSchema,
  /** リンクされた Instructor の ID（未リンクなら null） */
  instructorId: z.string().nullable(),
  isActive: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/** `POST /api/auth/me/link-instructor` のリクエスト契約 */
export const linkInstructorSchema = z.object({
  instructorId: z.string().min(1),
});

export type LinkInstructorInput = z.infer<typeof linkInstructorSchema>;
