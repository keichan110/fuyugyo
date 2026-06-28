/**
 * テストデータファクトリー
 *
 * テストで使用するダミーデータの生成関数を提供します。
 * Prismaのスキーマ定義に基づいて、各エンティティのファクトリー関数を定義しています。
 */

import type {
  Certification,
  Department,
  Instructor,
  Shift,
  ShiftAssignment,
  ShiftType,
} from "@prisma/client";
import type { InstructorStatus } from "@/types/common";

// カウンター（ユニークなID生成用）
let departmentCounter = 1;
let instructorCounter = 1;
let certificationCounter = 1;
let shiftCounter = 1;
let shiftTypeCounter = 1;
let assignmentCounter = 1;

/**
 * 部門データファクトリー
 */
export const createDepartment = (
  overrides: Partial<Department> = {}
): Department => {
  const counter = departmentCounter++;
  const id = `test-dept-${counter}`;
  return {
    id,
    code: `DEPT${String(counter).padStart(3, "0")}`,
    name: `テスト部門${counter}`,
    description: `テスト用の部門説明${counter}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * インストラクターデータファクトリー
 */
export const createInstructor = (
  overrides: Partial<Instructor> = {}
): Instructor => {
  const counter = instructorCounter++;
  const id = `test-instructor-${counter}`;
  return {
    id,
    lastName: `テスト姓${counter}`,
    firstName: `テスト名${counter}`,
    lastNameKana: `テストセイ${counter}`,
    firstNameKana: `テストメイ${counter}`,
    status: "ACTIVE" as InstructorStatus,
    notes: `テスト用のメモ${counter}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * 資格データファクトリー
 */
export const createCertification = (
  overrides: Partial<Certification> = {}
): Certification => {
  const counter = certificationCounter++;
  const id = `test-cert-${counter}`;
  return {
    id,
    departmentId: "test-dept-1", // デフォルト部門ID
    name: `テスト資格${counter}`,
    shortName: `資格${counter}`,
    organization: `テスト団体${counter}`,
    description: `テスト用の資格説明${counter}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * シフト種別データファクトリー
 */
export const createShiftType = (
  overrides: Partial<ShiftType> = {}
): ShiftType => {
  const counter = shiftTypeCounter++;
  const id = `test-shift-type-${counter}`;
  return {
    id,
    name: `テストシフト種別${counter}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * シフトデータファクトリー
 */
export const createShift = (overrides: Partial<Shift> = {}): Shift => {
  const counter = shiftCounter++;
  const id = `test-shift-${counter}`;
  const now = new Date();
  const defaultDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + counter
  );

  return {
    id,
    date: defaultDate,
    departmentId: "test-dept-1", // デフォルト部門ID
    shiftTypeId: "test-shift-type-1", // デフォルトシフト種別ID
    description: `テスト用のシフト説明${counter}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * シフト割り当てデータファクトリー
 */
export const createShiftAssignment = (
  overrides: Partial<ShiftAssignment> = {}
): ShiftAssignment => {
  const counter = assignmentCounter++;
  const id = `test-assignment-${counter}`;
  return {
    id,
    shiftId: "test-shift-1", // デフォルトシフトID
    instructorId: "test-instructor-1", // デフォルトインストラクターID
    assignedAt: new Date(),
    ...overrides,
  };
};

/**
 * 複数レコードの一括生成ヘルパー
 */
export const createDepartments = (
  count: number,
  overridesList?: Partial<Department>[]
): Department[] =>
  Array.from({ length: count }, (_, index) =>
    createDepartment(overridesList?.[index] || {})
  );

export const createInstructors = (
  count: number,
  overridesList?: Partial<Instructor>[]
): Instructor[] =>
  Array.from({ length: count }, (_, index) =>
    createInstructor(overridesList?.[index] || {})
  );

export const createCertifications = (
  count: number,
  overridesList?: Partial<Certification>[]
): Certification[] =>
  Array.from({ length: count }, (_, index) =>
    createCertification(overridesList?.[index] || {})
  );

export const createShifts = (
  count: number,
  overridesList?: Partial<Shift>[]
): Shift[] =>
  Array.from({ length: count }, (_, index) =>
    createShift(overridesList?.[index] || {})
  );

export const createShiftAssignments = (
  count: number,
  overridesList?: Partial<ShiftAssignment>[]
): ShiftAssignment[] =>
  Array.from({ length: count }, (_, index) =>
    createShiftAssignment(overridesList?.[index] || {})
  );

/**
 * 関連データを含む複合ファクトリー
 */
export const createCertificationWithDepartment = (
  certificationOverrides: Partial<Certification> = {},
  departmentOverrides: Partial<Department> = {}
) => {
  const department = createDepartment(departmentOverrides);
  const certification = createCertification({
    departmentId: department.id,
    ...certificationOverrides,
  });

  return { certification, department };
};

export const createShiftWithAssignments = (
  shiftOverrides: Partial<Shift> = {},
  assignmentCount = 2,
  assignmentOverrides: Partial<ShiftAssignment>[] = []
) => {
  const shift = createShift(shiftOverrides);
  const assignments = Array.from({ length: assignmentCount }, (_, index) =>
    createShiftAssignment({
      shiftId: shift.id,
      instructorId: `test-instructor-${index + 1}`,
      ...assignmentOverrides[index],
    })
  );

  return { shift, assignments };
};

/**
 * ファクトリーカウンターのリセット関数（テスト間で使用）
 */
export const resetFactoryCounters = () => {
  departmentCounter = 1;
  instructorCounter = 1;
  certificationCounter = 1;
  shiftCounter = 1;
  shiftTypeCounter = 1;
  assignmentCounter = 1;
};
