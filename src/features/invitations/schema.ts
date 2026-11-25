import { z } from 'zod';

/**
 * Invitation feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** 招待トークンの単一レコード（発行・停止のレスポンス） */
export const invitationSchema = z.object({
  token: z.string(),
  expiresAt: z.coerce.date(),
  isActive: z.boolean(),
  /** 作成者。作成者が削除済みの場合は null */
  createdBy: z.string().nullable(),
  maxUses: z.number().int().nullable(),
  usedCount: z.number().int(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Invitation = z.infer<typeof invitationSchema>;

/** 有効な招待一覧の1件。作成者の表示名を含む（削除済みの作成者は null） */
export const invitationListItemSchema = invitationSchema.extend({
  createdByName: z.string().nullable(),
});

export type InvitationListItem = z.infer<typeof invitationListItemSchema>;

/** 有効な招待トークン一覧レスポンス */
export const invitationListSchema = z.array(invitationListItemSchema);

/**
 * `/verify` エンドポイントのレスポンス。
 * 未認証エンドポイントのため `createdBy` 等の内部フィールドは含まない。
 */
export const verifyInvitationResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.coerce.date(),
  description: z.string().nullable(),
});

export type VerifyInvitationResponse = z.infer<typeof verifyInvitationResponseSchema>;
