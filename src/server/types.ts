import type { D1Database, Fetcher } from '@cloudflare/workers-types';

/**
 * Worker のバインディング型。Hono の `Bindings` および各 `c.env` の型として使う。
 * シークレット（LINE channel secret, JWT secret 等）は後続の認証 feature で追加する。
 */
export type Env = {
  /** D1 データベース */
  DB: D1Database;
  /** SPA 静的アセット配信用バインディング */
  ASSETS: Fetcher;
  JWT_EXPIRES_IN: string;
  INVITE_DEFAULT_EXPIRES: string;
};
