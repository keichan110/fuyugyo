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

    // トランザクション: インストラクター作成 + 資格紐付け
    const instructor = await (await getPrisma()).$transaction(async (tx) => {
      // インストラクター作成
      const newInstructor = await tx.instructor.create({
        data: instructorData,
      });

      // 資格紐付け
      if (certificationIds.length > 0) {
        await tx.instructorCertification.createMany({
          data: certificationIds.map((certId) => ({
            instructorId: newInstructor.id,
            certificationId: certId,
          })),
        });
      }

      // 作成したインストラクターを資格情報付きで返す
      return tx.instructor.findUnique({
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

    // トランザクション: インストラクター更新 + 資格再設定
    const instructor = await (await getPrisma()).$transaction(async (tx) => {
      // インストラクター更新
      await tx.instructor.update({
        where: { id },
        data: instructorData,
      });

      // 既存の資格紐付けを削除
      await tx.instructorCertification.deleteMany({
        where: { instructorId: id },
      });

      // 新しい資格紐付けを作成
      if (certificationIds.length > 0) {
        await tx.instructorCertification.createMany({
          data: certificationIds.map((certId) => ({
            instructorId: id,
            certificationId: certId,
          })),
        });
      }

      // 更新したインストラクターを資格情報付きで返す
      return tx.instructor.findUnique({
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
