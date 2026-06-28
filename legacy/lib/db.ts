import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

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
export async function getPrisma(): Promise<PrismaClient> {
  // Cloudflare Workers環境ではD1アダプターを使用
  try {
    const cloudflareContext = await getCloudflareContext();
    if (cloudflareContext?.env?.DB) {
      const { env } = cloudflareContext;
      const adapter = new PrismaD1(env.DB);
      return new PrismaClient({ adapter });
    }
    if (cloudflareContext) {
      // Cloudflare環境だがDBバインディングがない場合は設定エラー
      throw new Error(
        "Cloudflare context found, but D1 database binding 'DB' is missing. " +
          "Ensure it is configured in wrangler.toml or Pages project settings."
      );
    }
  } catch (error) {
    // Cloudflare環境での設定エラーは再スロー
    if (
      error instanceof Error &&
      error.message.includes("D1 database binding")
    ) {
      throw error;
    }
    // getCloudflareContext()が失敗した場合はローカル環境と判断
  }

  // ローカル開発環境ではシングルトンインスタンスを返す
  return prisma;
}
