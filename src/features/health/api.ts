import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '@/server/db/client';
import { shifts } from '@/server/db/schema';
import type { Env } from '@/server/types';

/**
 * ヘルスチェック用の最小 RPC エンドポイント。
 * D1 へ実際にクエリを投げ、接続とスキーマ適用が成立していることを確認する。
 * レスポンスは ADR 0005 に従い生データ + HTTP ステータス（`c.json(data)`）で返す。
 */
export const healthRoute = new Hono<{ Bindings: Env }>().get('/', async (c) => {
  const db = createDb(c.env.DB);
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(shifts);

  return c.json({
    status: 'ok' as const,
    shiftCount: row?.count ?? 0,
    timestamp: new Date().toISOString(),
  });
});
