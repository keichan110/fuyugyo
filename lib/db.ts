import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

// Cloudflare Workers環境でのPrismaクライアント設定
// OpenNext CloudflareがD1バインディングとの連携を自動で処理
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Cloudflare Workers環境ではD1アダプターを使用
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_CONTEXT) {
    // @ts-expect-error - cloudflareContextはOpenNextによって自動注入される
    const binding = globalThis.cloudflareContext?.env?.DB;
    if (binding) {
      const adapter = new PrismaD1(binding);
      return new PrismaClient({ adapter });
    }
  }

  // ローカル開発環境では通常のPrismaClientを使用
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
