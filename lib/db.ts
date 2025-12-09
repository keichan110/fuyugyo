import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * リクエストごとにPrismaクライアントインスタンスを取得
 * - Cloudflare Workers環境: リクエストごとに新しいインスタンスを生成
 * - ローカル開発環境: シングルトンインスタンスを返す
 * OpenNext Cloudflare公式ドキュメントに基づく実装
 * https://opennext.js.org/cloudflare/howtos/db
 */
export const getPrisma = cache(async (): Promise<PrismaClient> => {
  // Cloudflare Workers環境ではD1アダプターを使用
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_CONTEXT) {
    const { env } = await getCloudflareContext();
    const db = env.DB;
    if (!db) {
      throw new Error(
        "D1 database binding not found in Cloudflare environment. " +
          "Ensure DB binding is configured in wrangler.toml or Pages settings."
      );
    }
    const adapter = new PrismaD1(db);
    return new PrismaClient({ adapter });
  }

  // ローカル開発環境ではシングルトンインスタンスを返す
  return prisma;
});
