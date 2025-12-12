"use server";

import { authenticate } from "@/lib/auth/auth";
import { getPrisma } from "@/lib/db";
import { secureLog } from "@/lib/utils/logging";
import type { ActionResult } from "@/types/actions";

/**
 * 現在ログイン中のユーザーにインストラクターを紐付ける
 * ユーザー自身のみが実行可能
 *
 * Note: 複数のユーザーが同じインストラクターに紐付けることが可能
 * （例：LINEアカウントを作り直した場合など）
 *
 * @param instructorId - 紐付けるインストラクターID
 * @returns 成功時はsuccess: true、失敗時はerrorメッセージ
 */
export async function linkMyInstructor(
  instructorId: string
): Promise<ActionResult<void>> {
  const user = await authenticate();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // 既に同じインストラクターに紐付けられている場合は何もしない
  if (user.instructorId === instructorId) {
    return { success: true, data: undefined };
  }

  try {
    // インストラクターの存在確認とステータス検証
    const instructor = await (await getPrisma()).instructor.findUnique({
      where: { id: instructorId },
    });

    if (!instructor) {
      return { success: false, error: "インストラクターが見つかりません" };
    }

    if (instructor.status !== "ACTIVE") {
      return { success: false, error: "このインストラクターは利用できません" };
    }

    // 紐付け実行
    await (await getPrisma()).user.update({
      where: { id: user.id },
      data: { instructorId },
    });

    return { success: true, data: undefined };
  } catch (error) {
    secureLog("error", "インストラクター紐付け処理でエラーが発生しました", {
      userId: user.id,
      instructorId,
      error,
    });
    return { success: false, error: "紐付けに失敗しました" };
  }
}

/**
 * 現在ログイン中のユーザーのインストラクター紐付けを解除する
 *
 * @returns 成功時はsuccess: true、失敗時はerrorメッセージ
 */
export async function unlinkMyInstructor(): Promise<ActionResult<void>> {
  const user = await authenticate();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  try {
    await (await getPrisma()).user.update({
      where: { id: user.id },
      data: { instructorId: null },
    });

    return { success: true, data: undefined };
  } catch (error) {
    secureLog("error", "インストラクター紐付け解除処理でエラーが発生しました", {
      userId: user.id,
      error,
    });
    return { success: false, error: "紐付け解除に失敗しました" };
  }
}
