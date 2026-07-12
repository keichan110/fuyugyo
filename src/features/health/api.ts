import { Hono } from 'hono';

import type { Env } from '@/server/types';

/**
 * ヘルスチェック用の最小 RPC エンドポイント。
 * 認証不要で公開するため外部サービスへアクセスせず、Worker の応答だけを確認する。
 * レスポンスは ADR 0005 に従い生データ + HTTP ステータス（`c.json(data)`）で返す。
 */
export const healthRoute = new Hono<{ Bindings: Env }>().get('/', async (c) => {
  return c.json({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  });
});
