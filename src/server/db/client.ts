import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';

import * as schema from './schema';

/**
 * リクエストの D1 バインディングから Drizzle クライアントを生成する。
 * Prisma のようなクライアント再生成コストや double-await はない。
 *
 * @param d1 - `c.env.DB`（D1 バインディング）
 * @returns スキーマ付き Drizzle クライアント
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/** Drizzle クライアント型（各 feature の `api.ts` で引数型として利用） */
export type Database = ReturnType<typeof createDb>;
