/**
 * Cloudflare Workers環境の型定義
 */

import type { D1Database } from "@cloudflare/workers-types";

declare module "@opennextjs/cloudflare" {
  type CloudflareEnv = {
    DB: D1Database;
  };
}
