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
 * インストラクター割り当てを作成
 *
 * @param prisma - Prismaクライアント
 * @param shiftId - シフトID
 * @param instructorIds - 割り当てるインストラクターIDの配列
 * @param operationType - 操作の種類（作成/更新）
 * @returns 成功時はnull、失敗時はエラーメッセージ
 */
async function createInstructorAssignments(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  shiftId: string,
  instructorIds: string[],
  operationType: "作成" | "更新"
): Promise<string | null> {
  try {
    if (instructorIds.length > 0) {
      await prisma.shiftAssignment.createMany({
        data: instructorIds.map((instructorId) => ({
          shiftId,
          instructorId,
        })),
      });
    }
    return null;
  } catch (error) {
    return `シフトを${operationType}しましたが、インストラクターの割り当てに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`;
  }
}

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

    const prisma = await getPrisma();
    let shiftId: string;

    // 条件分岐: 既存シフト更新 or 新規作成
    if (existingShift && force) {
      // 1-a. 既存シフト更新
      const updated = await prisma.shift.update({
        where: { id: existingShift.id },
        data: { description: description || existingShift.description },
      });
      shiftId = updated.id;

      // 1-b. 既存割り当て削除
      await prisma.shiftAssignment.deleteMany({
        where: { shiftId },
      });
    } else {
      // 2. 新規シフト作成
      const created = await prisma.shift.create({
        data: {
          date: new Date(date),
          departmentId,
          shiftTypeId,
          description: description || null,
        },
      });
      shiftId = created.id;
    }

    // 3. インストラクター割り当て（失敗時は明示的エラー）
    const assignmentError = await createInstructorAssignments(
      prisma,
      shiftId,
      assignedInstructorIds,
      existingShift && force ? "更新" : "作成"
    );
    if (assignmentError) {
      return { success: false, error: assignmentError };
    }

    // 4. 完全なデータ取得
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
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

    // 再検証
    revalidatePath("/shifts");
    revalidateTag("shifts.list");

    return { success: true, data: shift };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "シフトの作成に失敗しました。" };
  }
}

/**
 * シフト更新アクション
 */
export async function updateShiftAction(
  id: string,
  input: UpdateShiftInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    const validated = updateShiftSchema.parse(input);
    const { description, assignedInstructorIds } = validated;

    const prisma = await getPrisma();

    // 1. シフト更新
    await prisma.shift.update({
      where: { id },
      data: { description },
    });

    // 2. インストラクター割り当て更新（指定された場合のみ）
    if (assignedInstructorIds) {
      await prisma.shiftAssignment.deleteMany({
        where: { shiftId: id },
      });

      // 割り当て作成（失敗時は明示的エラー）
      const assignmentError = await createInstructorAssignments(
        prisma,
        id,
        assignedInstructorIds,
        "更新"
      );
      if (assignmentError) {
        return { success: false, error: assignmentError };
      }
    }

    // 3. 更新後のデータ取得
    const shift = await prisma.shift.findUnique({
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

    revalidatePath("/shifts");
    revalidateTag("shifts.list");
    revalidateTag(`shifts.detail.${id}`);

    return { success: true, data: shift };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "シフトの更新に失敗しました。" };
  }
}

/**
 * シフト削除アクション
 */
export async function deleteShiftAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // カスケード削除により、shiftAssignmentも自動削除される
    await (await getPrisma()).shift.delete({
      where: { id },
    });

    revalidatePath("/shifts");
    revalidateTag("shifts.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "シフトの削除に失敗しました。" };
  }
}
