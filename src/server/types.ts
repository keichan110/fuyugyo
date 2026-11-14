import type { D1Database, Fetcher, RateLimit } from '@cloudflare/workers-types';

/**
 * Worker のバインディング型。Hono の `Bindings` および各 `c.env` の型として使う。
 * シークレット（JWT_SECRET, LINE_CHANNEL_SECRET 等）は `wrangler secret` で注入する。
 */
export type Env = {
  /** Worker 用の公開可能な DSN（Vars で注入。未設定なら通知しない） */
  SENTRY_DSN?: string;
  /** デプロイ対象のコミット SHA */
  SENTRY_RELEASE?: string;
  /** D1 データベース */
  DB: D1Database;
  /** SPA 静的アセット配信用バインディング */
  ASSETS: Fetcher;
  /** JWT と Cookie の有効期限（例: "2h"） */
  JWT_EXPIRES_IN: string;
  /** JWT を再発行する間隔（例: "15m"） */
  JWT_REFRESH_INTERVAL: string;
  /** 初回ログインからの絶対期限（例: "7d"） */
  JWT_ABSOLUTE_EXPIRES_IN: string;
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
  /** 認証済み高コスト read 用の CF ネイティブ Rate Limiter（userId キー、issue #214） */
  READ_RATE_LIMITER: RateLimit;
};
