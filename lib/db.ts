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
  } catch {
    // getCloudflareContext()が失敗した場合はローカル環境と判断
  }

  // ローカル開発環境ではシングルトンインスタンスを返す
  return prisma;
}
