"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireManagerAuth } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import {
  type CreateShiftTypeInput,
  createShiftTypeSchema,
  type UpdateShiftTypeInput,
  updateShiftTypeSchema,
} from "./schemas";

/**
 * シフト種別作成アクション
 */
export async function createShiftTypeAction(
  input: CreateShiftTypeInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // バリデーション
    const validated = createShiftTypeSchema.parse(input);

    // DB操作
    const shiftType = await (await getPrisma()).shiftType.create({
      data: validated,
    });

    // 再検証
    revalidatePath("/shift-types");
    revalidateTag("shift-types.list");

    return { success: true, data: shiftType };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create shift type" };
  }
}

/**
 * シフト種別更新アクション
 */
export async function updateShiftTypeAction(
  id: number,
  input: UpdateShiftTypeInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    const validated = updateShiftTypeSchema.parse(input);

    const shiftType = await (await getPrisma()).shiftType.update({
      where: { id },
      data: validated,
    });

    revalidatePath("/shift-types");
    revalidateTag("shift-types.list");
    revalidateTag(`shift-types.detail.${id}`);

    return { success: true, data: shiftType };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update shift type" };
  }
}

/**
 * シフト種別削除アクション（論理削除）
 */
export async function deleteShiftTypeAction(
  id: number
): Promise<ActionResult<void>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // 論理削除（isActive = false）
    await (await getPrisma()).shiftType.update({
      where: { id },
      data: { isActive: false },
    });

    revalidatePath("/shift-types");
    revalidateTag("shift-types.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete shift type" };
  }
}
