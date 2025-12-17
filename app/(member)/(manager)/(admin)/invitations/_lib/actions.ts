"use server";
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
        error:
          "権限が不足しています。管理者またはマネージャーロールが必要です。",
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
        error: "有効期限は未来の日時を指定してください。",
      };
    }

    const maxExpiresAt = new Date();
    maxExpiresAt.setMonth(maxExpiresAt.getMonth() + 1);
    if (expiresAt > maxExpiresAt) {
      return {
        success: false,
        error: "有効期限は1ヶ月以内で指定してください。",
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
    return { success: false, error: "招待の作成に失敗しました。" };
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

    const prisma = await getPrisma();
    const now = new Date(); // 現在時刻を一度だけ取得（時刻の一貫性を保つ）

    // 1. トークン検証（トランザクション外で実施）
    // トークン形式の基本チェック
    if (!token || typeof token !== "string") {
      return {
        success: false,
        error: "招待トークンの形式が正しくありません。",
      };
    }

    // プレフィックスチェック
    if (!token.startsWith(invitationConfig.tokenPrefix)) {
      return {
        success: false,
        error: "招待トークンの形式が正しくありません。",
      };
    }

    // トークン取得
    const invitationToken = await prisma.invitationToken.findUnique({
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
      return { success: false, error: "招待トークンが見つかりません。" };
    }

    if (!invitationToken.isActive) {
      return {
        success: false,
        error: "この招待トークンは無効化されています。",
      };
    }

    if (invitationToken.expiresAt <= now) {
      return {
        success: false,
        error: "招待トークンの有効期限が切れています。",
      };
    }

    if (
      invitationToken.maxUses !== null &&
      invitationToken.usedCount >= invitationToken.maxUses
    ) {
      return {
        success: false,
        error: "招待トークンの使用回数上限に達しています。",
      };
    }

    // 2. ユーザー存在チェック
    const existingUser = await prisma.user.findUnique({
      where: { lineUserId },
    });
    if (existingUser) {
      return { success: false, error: "このユーザーは既に登録されています。" };
    }

    // 3. 楽観的同時実行制御: usedCountをatomicに更新
    const updateResult = await prisma.invitationToken.updateMany({
      where: {
        token,
        isActive: true,
        expiresAt: { gt: now },
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

    // 4. 更新失敗（他の人が先に使用した）場合はエラー
    if (updateResult.count === 0) {
      return {
        success: false,
        error:
          "招待トークンが使用できなくなりました。既に使用されたか、有効期限が切れた可能性があります。",
      };
    }

    // 5. ユーザー作成（usedCountは既に増加済み）
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

    const user = await prisma.user.create({
      data: userData,
    });

    revalidatePath("/users");
    revalidateTag("users.list");

    return { success: true, data: user };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "招待の受諾に失敗しました。" };
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
        error: "権限が不足しています。管理者またはマネージャー権限が必要です。",
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
    return { success: false, error: "招待の削除に失敗しました。" };
  }
}
