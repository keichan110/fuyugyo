"use server";
import { revalidatePath } from "next/cache";
import { requireManagerAuth } from "@/lib/auth/role-guard";
import { getPrisma } from "@/lib/db";
import type { ActionResult } from "@/types/actions";
import { getCertifications, getDepartmentIdByType } from "./queries";
import {
  type CreateCertificationInput,
  createCertificationSchema,
  type UpdateCertificationInput,
  updateCertificationSchema,
} from "./schemas";
import type { CertificationWithDepartment } from "./types";

/**
 * 資格作成アクション
 */
export async function createCertificationAction(
  input: CreateCertificationInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // バリデーション
    const validated = createCertificationSchema.parse(input);

    // DB操作
    const certification = await (await getPrisma()).certification.create({
      data: validated,
      include: {
        department: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    // 再検証
    revalidatePath("/certifications");

    return { success: true, data: certification };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create certification" };
  }
}

/**
 * 資格更新アクション
 */
export async function updateCertificationAction(
  id: number,
  input: UpdateCertificationInput
): Promise<ActionResult<unknown>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    const validated = updateCertificationSchema.parse(input);

    const certification = await (await getPrisma()).certification.update({
      where: { id },
      data: validated,
      include: {
        department: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    revalidatePath("/certifications");

    return { success: true, data: certification };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update certification" };
  }
}

/**
 * 資格削除アクション（論理削除）
 */
export async function deleteCertificationAction(
  id: number
): Promise<ActionResult<void>> {
  try {
    // 認証・権限チェック（マネージャー以上）
    await requireManagerAuth();

    // 論理削除（isActive = false）
    await (await getPrisma()).certification.update({
      where: { id },
      data: { isActive: false },
    });

    revalidatePath("/certifications");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete certification" };
  }
}

/**
 * Client Component用: 部門タイプからIDを取得
 * Server Actionとして公開
 */
export async function getDepartmentIdByTypeAction(
  departmentType: "ski" | "snowboard"
): Promise<ActionResult<number>> {
  try {
    const departmentId = await getDepartmentIdByType(departmentType);
    return { success: true, data: departmentId };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get department ID" };
  }
}

/**
 * Client Component用: 有効な資格一覧を取得
 * Server Actionとして公開
 */
export async function getCertificationsAction(): Promise<
  ActionResult<CertificationWithDepartment[]>
> {
  try {
    const certifications = await getCertifications();
    return { success: true, data: certifications };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch certifications" };
  }
}
