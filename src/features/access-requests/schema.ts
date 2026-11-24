import { z } from 'zod';

/** 利用申請の受付結果（POST /api/access-requests の 201 レスポンス） */
export const accessRequestResponseSchema = z.object({
  /** 申請を受け付けた時刻（ISO 8601 文字列） */
  requestedAt: z.iso.datetime(),
});

export type AccessRequestResponse = z.infer<typeof accessRequestResponseSchema>;

/**
 * 承認待ちの利用申請 1 件（ADMIN 向け一覧）。
 * LINE ユーザー ID は管理画面にも公開しないため含めない。
 */
export const pendingAccessRequestSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().nullable(),
  /** 接続元から推定した国・地域・市区町村（目安。取得できなければ null） */
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  requestedAt: z.coerce.date(),
});

export type PendingAccessRequest = z.infer<typeof pendingAccessRequestSchema>;

/** 承認待ちの利用申請一覧レスポンス */
export const pendingAccessRequestListSchema = z.array(pendingAccessRequestSchema);

/** 承認リクエスト。インストラクターは任意で、指定すると承認と同時に紐付ける */
export const approveAccessRequestSchema = z.object({
  instructorId: z.string().min(1).optional(),
});

export type ApproveAccessRequestInput = z.infer<typeof approveAccessRequestSchema>;

/** 承認の成功レスポンス（作成したユーザーの ID） */
export const approveAccessRequestResponseSchema = z.object({
  id: z.string(),
});

/** 一括却下の 1 回あたりの上限件数 */
export const REJECT_BATCH_MAX = 20;

/** 一括却下リクエスト（重複 ID はサーバーで排除する） */
export const rejectBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(REJECT_BATCH_MAX),
});

export type RejectBatchInput = z.infer<typeof rejectBatchSchema>;

/** 一括却下の結果 */
export const rejectBatchResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
});
