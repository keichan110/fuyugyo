import type { D1Database, Fetcher, RateLimit } from '@cloudflare/workers-types';

/**
 * Worker のバインディング型。Hono の `Bindings` および各 `c.env` の型として使う。
 * シークレット（JWT_SECRET, LINE_CHANNEL_SECRET 等）は `wrangler secret` で注入する。
 */
export type Env = {
  /** D1 データベース */
  DB: D1Database;
  /** SPA 静的アセット配信用バインディング */
  ASSETS: Fetcher;
  /** JWT 有効期限（例: "12h"）。ADR 0003 により約1営業日相当に設定する */
  JWT_EXPIRES_IN: string;
  /** 招待トークンのデフォルト有効期限（例: "168h"） */
  INVITE_DEFAULT_EXPIRES: string;
  /** JWT 署名用シークレット（`wrangler secret`/`.dev.vars` で注入） */
  JWT_SECRET: string;
  /** LINE Login のチャネル ID */
  LINE_CHANNEL_ID: string;
  /** LINE Login のチャネルシークレット（`wrangler secret`/`.dev.vars` で注入） */
  LINE_CHANNEL_SECRET: string;
  /** アプリのベース URL。LINE コールバック URL とログイン後リダイレクトの基点 */
  APP_URL: string;
  /** 認証系エンドポイント用の CF ネイティブ Rate Limiter（ADR 0004） */
  AUTH_RATE_LIMITER: RateLimit;
};
