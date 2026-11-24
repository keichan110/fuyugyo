import { z } from 'zod';

/** 利用申請の受付結果（POST /api/access-requests の 201 レスポンス） */
export const accessRequestResponseSchema = z.object({
  /** 申請を受け付けた時刻（ISO 8601 文字列） */
  requestedAt: z.iso.datetime(),
});

export type AccessRequestResponse = z.infer<typeof accessRequestResponseSchema>;
