/**
 * Mock for lib/db
 * テスト環境ではPrismaクライアントをモック化
 */

import { prismaClientMock } from "@/__tests__/mocks/prisma";

// テスト用のモックPrismaクライアント
export const getPrisma = async () => prismaClientMock;

// 静的ルート用（既存のテストとの互換性のため）
export const prisma = prismaClientMock;
