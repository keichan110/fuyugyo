import { z } from 'zod';

/**
 * Invitation feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** 招待トークンの単一レコード */
export const invitationSchema = z.object({
  token: z.string(),
  expiresAt: z.coerce.date(),
  isActive: z.boolean(),
  createdBy: z.string(),
  maxUses: z.number().int().nullable(),
  usedCount: z.number().int(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Invitation = z.infer<typeof invitationSchema>;

/** 招待トークン一覧レスポンス */
export const invitationListSchema = z.array(invitationSchema);

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

/**
 * 招待トークン作成リクエスト。
 * `expiresInHours` 省略時は env.INVITE_DEFAULT_EXPIRES（例: "168h"）を有効期限として使う。
 */
export const createInvitationSchema = z.object({
  description: z.string().max(255).optional(),
  /** 使用上限回数。省略時は制限なし */
  maxUses: z.number().int().positive().optional(),
  /** 有効期限（時間）。省略時は env.INVITE_DEFAULT_EXPIRES を使う */
  expiresInHours: z.number().int().min(1).max(8760).optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
