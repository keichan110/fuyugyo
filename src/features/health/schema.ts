import { z } from 'zod';

/**
 * ヘルスチェックのレスポンス契約。
 * サーバー（`api.ts`）の出力検証とクライアント表示で共有する isomorphic スキーマ。
 */
export const healthResponseSchema = z.object({
  /** 常に "ok"。Worker が応答できた場合のみ返る */
  status: z.literal('ok'),
  /** サーバー時刻（ISO 8601） */
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
