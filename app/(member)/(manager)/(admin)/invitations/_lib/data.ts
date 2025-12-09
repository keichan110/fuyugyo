import { cache } from "react";
import { ensureRole } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { InvitationTokenWithStats } from "./types";

/**
 * 招待一覧を取得（Server Component用）
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止
 *
 * Next.js推奨パターン: Data Access Layer (DAL)
 * - ensureRole()による認証・認可チェック（verifySession相当）
 * - ユーザーのロールに基づいてデータをフィルタリング
 * - MANAGERは自分が作成した招待のみ、ADMINは全招待を取得
 */
export const getInvitations = cache(
  async (): Promise<InvitationTokenWithStats[]> => {
    // 1. 認証・認可チェック（Next.js推奨のDALパターン）
    const result = await ensureRole({ atLeast: "MANAGER" });

    if (result.status !== "authorized") {
      throw new Error("Unauthorized: Manager role required");
    }

    const user = result.user;

    // 2. ユーザーのロールに基づいてデータをフィルタリング
    // MANAGER: 自分が作成した招待のみ
    // ADMIN: 全ての招待（将来的にshowAllフラグで制御可能）
    const tokens = await (await getPrisma()).invitationToken.findMany({
      where: {
        // MANAGERの場合は作成者フィルタを適用
        ...(user.role !== "ADMIN" && { createdBy: user.id }),
      },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 3. Prismaの結果をフロントエンド用の型に変換
    // Date型をISO 8601文字列に変換してシリアライズ可能にする
    const invitations: InvitationTokenWithStats[] = tokens.map((token) => {
      const remainingUses = token.maxUses ? token.maxUses - token.usedCount : 0;

      return {
        token: token.token,
        description: token.description || "",
        expiresAt: token.expiresAt.toISOString(),
        isActive: token.isActive,
        maxUses: token.maxUses,
        usageCount: token.usedCount,
        remainingUses,
        createdAt: token.createdAt.toISOString(),
        createdBy: token.creator.displayName,
      };
    });

    return invitations;
  }
);
