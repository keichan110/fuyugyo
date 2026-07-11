import { z } from 'zod';

/**
 * ヘルスチェックのレスポンス契約。
 * サーバー（`api.ts`）の出力検証とクライアント表示で共有する isomorphic スキーマ。
 */
export const healthResponseSchema = z.object({
  /** 常に "ok"。D1 まで疎通できた場合のみ返る */
  status: z.literal('ok'),
  /** D1 から取得したシフト数（接続とスキーマ適用の確認用） */
  shiftCount: z.number().int().nonnegative(),
  /** サーバー時刻（ISO 8601） */
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
