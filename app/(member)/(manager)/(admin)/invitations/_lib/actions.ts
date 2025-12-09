"use server";
import type { PrismaClient } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  createInvitationToken,
  deactivateInvitationToken,
  generateInvitationUrl,
  invitationConfig,
} from "@/lib/auth/invitations";
import { requireAuth } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import {
  type AcceptInvitationInput,
  acceptInvitationSchema,
  type CreateInvitationInput,
  createInvitationSchema,
} from "./schemas";

/**
 * デフォルトの招待有効期限（日数）
 */
const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

/**
 * トランザクション内でのトークン検証とユーザー存在チェック
 *
 * トークンの取得から検証までトランザクション内で実行することで、
 * TOCTTOU（Time-of-Check-Time-of-Use）競合状態を防止します。
 */
async function validateTokenAndCheckUser(
  token: string,
  lineUserId: string,
  tx: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
  >
) {
  // トークン形式の基本チェック
  if (!token || typeof token !== "string") {
    throw new Error("Invalid token format");
  }

  // プレフィックスチェック
  if (!token.startsWith(invitationConfig.tokenPrefix)) {
    throw new Error("Invalid token prefix");
  }

  // トランザクション内でトークンを取得（race condition対策）
  const invitationToken = await tx.invitationToken.findUnique({
    where: { token },
    include: {
      creator: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
    },
  });

  if (!invitationToken) {
    throw new Error("Invitation token not found");
  }

  // アクティブ状態チェック
  if (!invitationToken.isActive) {
    throw new Error("Invitation token is disabled");
  }

  // 有効期限チェック
  const now = new Date();
  if (invitationToken.expiresAt <= now) {
    throw new Error("Invitation token has expired");
  }

  // 使用回数制限チェック
  if (
    invitationToken.maxUses !== null &&
    invitationToken.usedCount >= invitationToken.maxUses
  ) {
    throw new Error("Invitation token has reached maximum uses");
  }

  // ユーザー存在チェック
  const existingUser = await tx.user.findUnique({
    where: { lineUserId },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  return invitationToken;
}

/**
 * 招待作成アクション（管理者・マネージャー専用）
 *
 * 新規ユーザーを招待するためのトークンとURLを生成します。
 * 既存の有効な招待トークンは自動的に無効化されます。
 *
 * @param input - 招待作成入力データ
 * @returns 招待トークンとURL、またはエラー
 *
 * @example
 * ```typescript
 * const result = await createInvitationAction({
 *   description: "新規スタッフ募集",
 *   expiresAt: "2024-12-31T23:59:59Z",
 *   role: "MEMBER"
 * });
 *
 * if (result.success) {
 *   console.log("招待URL:", result.data.url);
 * }
 * ```
 */
export async function createInvitationAction(
  input: CreateInvitationInput
): Promise<ActionResult<{ token: string; url: string }>> {
  try {
    // 認証チェック（管理者またはマネージャー）
    const user = await requireAuth();

    // 権限チェック
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return {
        success: false,
        error: "Insufficient permissions. Admin or Manager role required.",
      };
    }

    // バリデーション
    const validated = createInvitationSchema.parse(input);

    // 有効期限の設定（省略時はデフォルト7日後）
    const expiresAt = validated.expiresAt
      ? new Date(validated.expiresAt)
      : (() => {
          const date = new Date();
          date.setDate(date.getDate() + DEFAULT_INVITATION_EXPIRY_DAYS);
          return date;
        })();

    // 有効期限の妥当性チェック（過去の日時でないこと、最大1ヶ月）
    const now = new Date();
    if (expiresAt <= now) {
      return {
        success: false,
        error: "Expiration date must be in the future",
      };
    }

    const maxExpiresAt = new Date();
    maxExpiresAt.setMonth(maxExpiresAt.getMonth() + 1);
    if (expiresAt > maxExpiresAt) {
      return {
        success: false,
        error: "Expiration date cannot be more than 1 month in the future",
      };
    }

    // 招待トークン作成（既存の有効な招待は自動的に無効化される）
    // descriptionが存在する場合のみ渡す（exactOptionalPropertyTypes対応）
    const createParams: {
      createdBy: string;
      description?: string;
      expiresAt: Date;
    } = {
      createdBy: user.id,
      expiresAt,
    };

    if (validated.description) {
      createParams.description = validated.description;
    }

    const invitationToken = await createInvitationToken(createParams);

    // ベースURL取得
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // 招待URL生成
    const invitationUrl = generateInvitationUrl(invitationToken.token, baseUrl);

    // キャッシュ再検証
    revalidatePath("/invitations");
    revalidateTag("invitations.list");

    return {
      success: true,
      data: {
        token: invitationToken.token,
        url: invitationUrl,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create invitation" };
  }
}

/**
 * 招待受諾アクション（認証不要）
 *
 * ユーザーが招待URLから登録する際に使用します。
 * トークンの検証、ユーザー作成、使用回数の更新をトランザクションで実行します。
 *
 * @param input - 招待受諾入力データ
 * @returns 作成されたユーザー情報、またはエラー
 *
 * @example
 * ```typescript
 * const result = await acceptInvitationAction({
 *   token: "inv_abc123...",
 *   lineUserId: "U1234567890abcdef",
 *   displayName: "山田太郎",
 *   pictureUrl: "https://example.com/avatar.jpg"
 * });
 *
 * if (result.success) {
 *   console.log("ユーザー登録成功");
 * }
 * ```
 */
export async function acceptInvitationAction(
  input: AcceptInvitationInput
): Promise<ActionResult<unknown>> {
  try {
    const validated = acceptInvitationSchema.parse(input);
    const { token, lineUserId, displayName, pictureUrl } = validated;

    const result = await (await getPrisma()).$transaction(async (tx) => {
      const invitationToken = await validateTokenAndCheckUser(
        token,
        lineUserId,
        tx
      );

      const userData: {
        lineUserId: string;
        displayName: string;
        pictureUrl?: string | null;
        role: string;
      } = {
        lineUserId,
        displayName,
        role: "MEMBER",
      };

      if (pictureUrl) {
        userData.pictureUrl = pictureUrl;
      }

      const user = await tx.user.create({
        data: userData,
      });

      const updateResult = await tx.invitationToken.updateMany({
        where: {
          token,
          ...(invitationToken.maxUses !== null
            ? { usedCount: { lt: invitationToken.maxUses } }
            : {}),
        },
        data: {
          usedCount: {
            increment: 1,
          },
        },
      });

      if (updateResult.count === 0) {
        throw new Error("Invitation token has reached maximum uses");
      }

      return user;
    });

    revalidatePath("/users");
    revalidateTag("users.list");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to accept invitation" };
  }
}

/**
 * 招待削除アクション（管理者・マネージャー専用）
 *
 * 招待トークンを無効化します。
 *
 * @param token - 削除対象の招待トークン
 * @returns 削除成功、またはエラー
 *
 * @example
 * ```typescript
 * const result = await deleteInvitationAction("inv_abc123...");
 * if (result.success) {
 *   console.log("招待を無効化しました");
 * }
 * ```
 */
export async function deleteInvitationAction(
  token: string
): Promise<ActionResult<void>> {
  try {
    // 認証チェック（管理者またはマネージャー）
    const user = await requireAuth();

    // 権限チェック
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return {
        success: false,
        error: "Insufficient permissions. Admin or Manager role required.",
      };
    }

    // 招待トークン無効化
    await deactivateInvitationToken(token, user.id);

    // キャッシュ再検証
    revalidatePath("/invitations");
    revalidateTag("invitations.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete invitation" };
  }
}
