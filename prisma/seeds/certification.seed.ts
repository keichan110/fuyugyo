import type { PrismaClient } from "@prisma/client";
import type { DepartmentSeeds } from "./department.seed";

export interface CertificationSeeds {
  skiCertifications: Array<{ id: number; name: string; shortName: string }>;
  snowboardCertifications: Array<{
    id: number;
    name: string;
    shortName: string;
  }>;
}

export async function seedCertifications(
  prisma: PrismaClient,
  departments: DepartmentSeeds
): Promise<CertificationSeeds> {
  console.log("資格データを作成中...");

  const { skiDepartment, snowboardDepartment } = departments;

  // スキー資格
  const skiCertifications = await Promise.all([
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "公認スキー指導員",
        shortName: "指導員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "公認スキー準指導員",
        shortName: "準指導員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "認定スキー指導員",
        shortName: "認定指導員",
        organization: "SAS",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "公認スキーA級検定員",
        shortName: "A級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "公認スキーB級検定員",
        shortName: "B級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: skiDepartment.id,
        name: "公認スキーC級検定員",
        shortName: "C級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
  ]);

  // スノーボード資格
  const snowboardCertifications = await Promise.all([
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "公認スノーボード指導員",
        shortName: "指導員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "公認スノーボード準指導員",
        shortName: "準指導員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "認定スノーボード指導員",
        shortName: "認定指導員",
        organization: "SAS",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "公認スノーボードA級検定員",
        shortName: "A級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "公認スノーボードB級検定員",
        shortName: "B級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
    prisma.certification.create({
      data: {
        departmentId: snowboardDepartment.id,
        name: "公認スノーボードC級検定員",
        shortName: "C級検定員",
        organization: "SAJ",
        description: "",
      },
    }),
  ]);

  console.log(
    `資格: スキー${skiCertifications.length}件, スノボ${snowboardCertifications.length}件`
  );

  return { skiCertifications, snowboardCertifications };
}
