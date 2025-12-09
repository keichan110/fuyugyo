import type { PrismaClient } from "@prisma/client";

export interface DepartmentSeeds {
  skiDepartment: { id: number; code: string; name: string };
  snowboardDepartment: { id: number; code: string; name: string };
}

export async function seedDepartments(
  prisma: PrismaClient
): Promise<DepartmentSeeds> {
  console.log("部門データを作成中...");

  const skiDepartment = await prisma.department.create({
    data: {
      code: "ski",
      name: "スキー",
      description: "スキー部門",
    },
  });

  const snowboardDepartment = await prisma.department.create({
    data: {
      code: "snowboard",
      name: "スノーボード",
      description: "スノーボード部門",
    },
  });

  console.log(`部門: ${skiDepartment.name}, ${snowboardDepartment.name}`);

  return { skiDepartment, snowboardDepartment };
}
