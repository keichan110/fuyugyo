import { cache } from "react";
import "server-only";
import { getPrisma } from "@/lib/db";

/**
 * 資格一覧を取得する関数（キャッシュ付き）
 * 複数のコンポーネントから呼ばれても、同一リクエスト内では1回だけ実行される
 *
 * NOTE: この関数は他のページ（instructor-modal など）で使用されています。
 */
export const getCertifications = cache(
  async () =>
    await (await getPrisma()).certification.findMany({
      where: { isActive: true },
      include: {
        department: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { name: "asc" },
    })
);

/**
 * Department名からIDを取得するヘルパー関数
 * Server Actionsへの入力データ変換に使用
 */
export async function getDepartmentIdByType(
  departmentType: "ski" | "snowboard"
): Promise<number> {
  const departments = await (await getPrisma()).department.findMany({
    select: { id: true, name: true },
  });

  const targetDepartment = departments.find((dept) => {
    const name = dept.name.toLowerCase();
    if (departmentType === "ski") {
      return name.includes("スキー") || name.includes("ski");
    }
    return name.includes("スノーボード") || name.includes("snowboard");
  });

  if (!targetDepartment) {
    return departments[0]?.id || 1;
  }

  return targetDepartment.id;
}
