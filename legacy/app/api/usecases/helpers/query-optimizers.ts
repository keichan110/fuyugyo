import type { Prisma } from "@prisma/client";

/**
 * インストラクターの最小限の選択フィールド
 */
export const instructorMinimalSelect = {
  id: true,
  lastName: true,
  firstName: true,
  lastNameKana: true,
  firstNameKana: true,
  status: true,
} satisfies Prisma.InstructorSelect;

/**
 * インストラクターと資格情報の選択フィールド
 */
export const instructorWithCertificationsSelect = {
  ...instructorMinimalSelect,
  certifications: {
    select: {
      certification: {
        select: {
          id: true,
          shortName: true,
          departmentId: true,
        },
      },
    },
  },
} satisfies Prisma.InstructorSelect;

/**
 * 部門の最小限の選択フィールド
 */
export const departmentMinimalSelect = {
  id: true,
  name: true,
  code: true,
} satisfies Prisma.DepartmentSelect;

/**
 * シフト種別の最小限の選択フィールド
 */
export const shiftTypeMinimalSelect = {
  id: true,
  name: true,
} satisfies Prisma.ShiftTypeSelect;
