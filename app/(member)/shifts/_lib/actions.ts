"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireManagerAuth } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import {
  type CreateShiftInput,
  createShiftSchema,
  type UpdateShiftInput,
  updateShiftSchema,
} from "./schemas";

/**
 * シフト作成アクション（重複チェック付き）
 */
export async function createShiftAction(
  input: CreateShiftInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // バリデーション
    const validated = createShiftSchema.parse(input);
    const {
      date,
      departmentId,
      shiftTypeId,
      description,
      force,
      assignedInstructorIds,
    } = validated;

    // 既存シフトチェック
    const existingShift = await (await getPrisma()).shift.findUnique({
      where: {
        unique_shift_per_day: {
          date: new Date(date),
          departmentId,
          shiftTypeId,
        },
      },
      include: {
        department: true,
        shiftType: true,
        shiftAssignments: {
          include: {
            instructor: true,
          },
        },
      },
    });

    // 重複チェック（force=false の場合）
    if (existingShift && !force) {
      return {
        success: false,
        error: "DUPLICATE_SHIFT",
      };
    }

    // トランザクション: シフト作成/更新 + インストラクター割り当て
    const shift = await (await getPrisma()).$transaction(async (tx) => {
      let result: { id: number };

      if (existingShift && force) {
        // 強制更新: 既存シフトを更新
        result = await tx.shift.update({
          where: { id: existingShift.id },
          data: { description: description || existingShift.description },
          include: { department: true, shiftType: true },
        });

        // 既存割り当てを削除
        await tx.shiftAssignment.deleteMany({
          where: { shiftId: result.id },
        });
      } else {
        // 新規作成
        result = await tx.shift.create({
          data: {
            date: new Date(date),
            departmentId,
            shiftTypeId,
            description: description || null,
          },
          include: { department: true, shiftType: true },
        });
      }

      // インストラクター割り当て
      if (assignedInstructorIds.length > 0) {
        await tx.shiftAssignment.createMany({
          data: assignedInstructorIds.map((instructorId) => ({
            shiftId: result.id,
            instructorId,
          })),
        });
      }

      // 割り当て情報付きで返す
      return tx.shift.findUnique({
        where: { id: result.id },
        include: {
          department: true,
          shiftType: true,
          shiftAssignments: {
            include: {
              instructor: true,
            },
          },
        },
      });
    });

    // 再検証
    revalidatePath("/shifts");
    revalidateTag("shifts.list");

    return { success: true, data: shift };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create shift" };
  }
}

/**
 * シフト更新アクション
 */
export async function updateShiftAction(
  id: number,
  input: UpdateShiftInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    const validated = updateShiftSchema.parse(input);
    const { description, assignedInstructorIds } = validated;

    const shift = await (await getPrisma()).$transaction(async (tx) => {
      // シフト更新
      await tx.shift.update({
        where: { id },
        data: { description },
      });

      // インストラクター割り当て更新（指定された場合のみ）
      if (assignedInstructorIds) {
        await tx.shiftAssignment.deleteMany({
          where: { shiftId: id },
        });

        if (assignedInstructorIds.length > 0) {
          await tx.shiftAssignment.createMany({
            data: assignedInstructorIds.map((instructorId) => ({
              shiftId: id,
              instructorId,
            })),
          });
        }
      }

      return tx.shift.findUnique({
        where: { id },
        include: {
          department: true,
          shiftType: true,
          shiftAssignments: {
            include: {
              instructor: true,
            },
          },
        },
      });
    });

    revalidatePath("/shifts");
    revalidateTag("shifts.list");
    revalidateTag(`shifts.detail.${id}`);

    return { success: true, data: shift };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update shift" };
  }
}

/**
 * シフト削除アクション
 */
export async function deleteShiftAction(
  id: number
): Promise<ActionResult<void>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // トランザクション: 割り当て削除 → シフト削除
    await (await getPrisma()).$transaction(async (tx) => {
      await tx.shiftAssignment.deleteMany({
        where: { shiftId: id },
      });

      await tx.shift.delete({
        where: { id },
      });
    });

    revalidatePath("/shifts");
    revalidateTag("shifts.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete shift" };
  }
}
