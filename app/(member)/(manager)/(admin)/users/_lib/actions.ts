"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from "./schemas";

/**
 * ユーザー作成アクション(管理者専用)
 *
 * 注意: 通常のユーザー登録は招待システム経由で行われます。
 * このアクションは管理者が直接ユーザーを作成する特殊ケース用です。
 *
 * @param input - ユーザー作成入力データ
 * @returns 作成されたユーザー情報、またはエラー
 *
 * @example
 * ```typescript
 * const result = await createUserAction({
 *   lineUserId: "U1234567890abcdef",
 *   displayName: "山田太郎",
 *   pictureUrl: "https://example.com/avatar.jpg",
 *   role: "MEMBER"
 * });
 *
 * if (result.success) {
 *   console.log("ユーザー作成成功:", result.data);
 * } else {
 *   console.error("エラー:", result.error);
 * }
 * ```
 */
export async function createUserAction(
  input: CreateUserInput
): Promise<ActionResult<unknown>> {
  try {
    // 管理者権限チェック
    await requireAdmin();

    // バリデーション
    const validated = createUserSchema.parse(input);

    const prisma = await getPrisma();

    // 既存ユーザーチェック(LINE User IDの重複確認)
    const existing = await prisma.user.findUnique({
      where: { lineUserId: validated.lineUserId },
    });

    if (existing) {
      return { success: false, error: "User with this LINE ID already exists" };
    }

    // ユーザー作成(exactOptionalPropertyTypes対応)
    const userData: {
      lineUserId: string;
      displayName: string;
      pictureUrl?: string | null;
      role: "ADMIN" | "MANAGER" | "MEMBER";
    } = {
      lineUserId: validated.lineUserId,
      displayName: validated.displayName,
      role: validated.role,
    };

    if (validated.pictureUrl !== undefined) {
      userData.pictureUrl = validated.pictureUrl;
    }

    const user = await prisma.user.create({
      data: userData,
    });

    // キャッシュ再検証
    revalidatePath("/users");
    revalidateTag("users.list");

    return { success: true, data: user };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create user" };
  }
}

/**
 * ユーザー更新アクション(管理者専用)
 *
 * 更新可能なフィールド:
 * - displayName: 表示名
 * - role: ユーザー権限(ADMIN, MANAGER, MEMBER)
 * - isActive: アクティブ状態
 *
 * 制限:
 * - 自分自身のアカウントは編集できません
 * - lineUserId は変更不可
 *
 * @param id - 更新対象ユーザーID
 * @param input - 更新データ
 * @returns 更新されたユーザー情報、またはエラー
 *
 * @example
 * ```typescript
 * const result = await updateUserAction("user_123", {
 *   role: "MANAGER",
 *   isActive: true
 * });
 * ```
 */
export async function updateUserAction(
  id: string,
  input: UpdateUserInput
): Promise<ActionResult<unknown>> {
  try {
    // 管理者権限チェック
    const admin = await requireAdmin();

    // 自分自身の編集チェック
    if (admin.id === id) {
      return {
        success: false,
        error: "Cannot modify your own user account",
      };
    }

    // バリデーション
    const validated = updateUserSchema.parse(input);

    const prisma = await getPrisma();

    // ユーザー存在確認
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    // 実際に提供されたフィールドのみを抽出(exactOptionalPropertyTypes対応)
    const updateData: {
      displayName?: string;
      role?: "ADMIN" | "MANAGER" | "MEMBER";
      isActive?: boolean;
    } = {};

    if (validated.displayName !== undefined) {
      updateData.displayName = validated.displayName;
    }
    if (validated.role !== undefined) {
      updateData.role = validated.role;
    }
    if (validated.isActive !== undefined) {
      updateData.isActive = validated.isActive;
    }

    // ユーザー更新
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // キャッシュ再検証
    revalidatePath("/users");
    revalidateTag("users.list");
    revalidateTag(`users.detail.${id}`);

    return { success: true, data: user };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update user" };
  }
}

/**
 * ユーザー削除アクション(管理者専用)
 *
 * 注意: 物理削除ではなく、isActive を false にする論理削除です。
 *
 * 制限:
 * - 自分自身のアカウントは削除できません
 *
 * @param id - 削除対象ユーザーID
 * @returns 削除成功、またはエラー
 *
 * @example
 * ```typescript
 * const result = await deleteUserAction("user_123");
 * if (result.success) {
 *   console.log("ユーザーを無効化しました");
 * }
 * ```
 */
export async function deleteUserAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    // 管理者権限チェック
    const admin = await requireAdmin();

    // 自分自身の削除チェック
    if (admin.id === id) {
      return {
        success: false,
        error: "Cannot delete your own user account",
      };
    }

    const prisma = await getPrisma();

    // ユーザー存在確認
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    // 既に無効化済みかチェック
    if (!existingUser.isActive) {
      return {
        success: false,
        error: "User is already inactive",
      };
    }

    // ユーザー無効化(論理削除)
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // キャッシュ再検証
    revalidatePath("/users");
    revalidateTag("users.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete user" };
  }
}
