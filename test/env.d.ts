import type { D1Migration } from 'cloudflare:test';

// テスト用 D1 のバインディング型。`cloudflare:test` の `env` は `Cloudflare.Env` を参照する。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ASSETS: Fetcher;
      JWT_EXPIRES_IN: string;
      INVITE_DEFAULT_EXPIRES: string;
      /** vitest.config.ts の miniflare バインディングから渡されるマイグレーション一覧 */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
