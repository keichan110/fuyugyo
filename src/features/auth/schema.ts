import { z } from 'zod';

/**
 * 認証 feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** ユーザーロール（ADMIN > MANAGER > MEMBER） */
export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'MEMBER']);

export type Role = z.infer<typeof roleSchema>;

/**
 * ロールの序列（ADR 0003）。ADMIN > MANAGER > MEMBER。
 * クライアント側の表示制御用。サーバー側の判定は `server/auth/roles.ts` の同名ロジックを使う
 * （クライアントは ESLint 境界ルールにより `server/` 配下を import できないため）。
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
};

/** `role` が `required` 以上の権限を持つか判定する（クライアント用） */
export function hasMinimumRole(role: Role, required: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}

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
