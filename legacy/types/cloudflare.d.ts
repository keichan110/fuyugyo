/**
 * Cloudflare Workers環境の型定義
 * OpenNext CloudflareのCloudflareEnvを拡張し、
 * getCloudflareContext()から返されるenv型に自動的に反映される
 */

import type { D1Database } from "@cloudflare/workers-types";

declare global {
  // Declaration merging with @opennextjs/cloudflare's CloudflareEnv interface
  // biome-ignore lint/nursery/useConsistentTypeDefinitions: Interface is required for declaration merging with global CloudflareEnv
  interface CloudflareEnv {
    DB: D1Database;
  }
}
