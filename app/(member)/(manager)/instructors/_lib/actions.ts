"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireManagerAuth } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import {
  type CreateInstructorInput,
  createInstructorSchema,
  type UpdateInstructorInput,
  updateInstructorSchema,
} from "./schemas";

/**
 * インストラクター作成アクション
 */
export async function createInstructorAction(
  input: CreateInstructorInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // バリデーション
    const validated = createInstructorSchema.parse(input);
    const { certificationIds, ...instructorData } = validated;

    const prisma = await getPrisma();

    // 1. インストラクター作成
    const newInstructor = await prisma.instructor.create({
      data: instructorData,
    });

    // 2. 資格紐付け（失敗時は明示的エラー）
    try {
      if (certificationIds.length > 0) {
        await prisma.instructorCertification.createMany({
          data: certificationIds.map((certId) => ({
            instructorId: newInstructor.id,
            certificationId: certId,
          })),
        });
      }
    } catch (certError) {
      return {
        success: false,
        error: `インストラクターを作成しましたが、資格の紐付けに失敗しました: ${certError instanceof Error ? certError.message : "Unknown error"}`,
      };
    }

    // 3. 完全なデータを取得
    const instructor = await prisma.instructor.findUnique({
      where: { id: newInstructor.id },
      include: {
        certifications: {
          include: {
            certification: {
              include: {
                department: true,
              },
            },
          },
        },
      },
    });

    // 再検証
    revalidatePath("/instructors");
    revalidateTag("instructors.list");

    return { success: true, data: instructor };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create instructor" };
  }
}

/**
 * インストラクター更新アクション
 */
export async function updateInstructorAction(
  id: string,
  input: UpdateInstructorInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    const validated = updateInstructorSchema.parse(input);
    const { certificationIds, ...instructorData } = validated;

    const prisma = await getPrisma();

    // 1. インストラクター更新
    await prisma.instructor.update({
      where: { id },
      data: instructorData,
    });

    // 2. 既存の資格紐付けを削除
    await prisma.instructorCertification.deleteMany({
      where: { instructorId: id },
    });

    // 3. 新しい資格紐付けを作成（失敗時は明示的エラー）
    try {
      if (certificationIds.length > 0) {
        await prisma.instructorCertification.createMany({
          data: certificationIds.map((certId) => ({
            instructorId: id,
            certificationId: certId,
          })),
        });
      }
    } catch (certError) {
      return {
        success: false,
        error: `インストラクター情報を更新しましたが、資格の紐付けに失敗しました: ${certError instanceof Error ? certError.message : "Unknown error"}`,
      };
    }

    // 4. 更新したインストラクターを取得
    const instructor = await prisma.instructor.findUnique({
      where: { id },
      include: {
        certifications: {
          include: {
            certification: {
              include: {
                department: true,
              },
            },
          },
        },
      },
    });

    revalidatePath("/instructors");
    revalidateTag("instructors.list");
    revalidateTag(`instructors.detail.${id}`);

    return { success: true, data: instructor };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update instructor" };
  }
}

/**
 * インストラクター削除アクション（論理削除）
 */
export async function deleteInstructorAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // 論理削除（status = INACTIVE）
    await (await getPrisma()).instructor.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    revalidatePath("/instructors");
    revalidateTag("instructors.list");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete instructor" };
  }
}
