/**
 * Cloudflare Workers環境の型定義
 * グローバルなCloudflareEnvインターフェースを拡張し、
 * getCloudflareContext()から返されるenv型に自動的に反映される
 */

import type { D1Database } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }

  namespace App {
    interface CloudflareEnv extends globalThis.CloudflareEnv {}
  }
}
