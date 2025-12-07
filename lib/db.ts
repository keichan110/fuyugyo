import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { cache } from "react";

/**
 * リクエストごとに新しいPrismaクライアントインスタンスを生成
 * Cloudflare Workers環境では接続プールの再利用が許可されていないため
 * OpenNext Cloudflare公式ドキュメントに基づく実装
 * https://opennext.js.org/cloudflare/howtos/db
 */
export const getPrisma = cache(async () => {
  // Cloudflare Workers環境ではD1アダプターを使用
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_CONTEXT) {
    const { env } = await getCloudflareContext();
    const db = (env as App.CloudflareEnv).DB;
    if (!db) {
      throw new Error(
        "D1 database binding not found in Cloudflare environment. " +
          "Ensure DB binding is configured in wrangler.toml or Pages settings."
      );
    }
    const adapter = new PrismaD1(db);
    return new PrismaClient({ adapter });
  }

  // ローカル開発環境では通常のPrismaClientを使用
  return new PrismaClient();
});

/**
 * 静的ルート（ISR/SSG）用の同期版
 * 動的ルートでは getPrisma() を使用すること
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
