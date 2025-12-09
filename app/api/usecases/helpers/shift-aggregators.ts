import { formatDateString, formatInstructorDisplayName } from "./formatters";

/**
 * Prismaから取得したシフトデータの型定義
 */
type RawShiftData = {
  id: number;
  date: Date;
  description: string | null;
  department: {
    id: number;
    name: string;
    code: string;
  };
  shiftType: {
    id: number;
    name: string;
  };
  shiftAssignments: Array<{
    instructor: {
      id: number;
      lastName: string;
      firstName: string;
    };
  }>;
};

/**
 * 整形後のシフトデータの型定義
 */
export type FormattedShiftData = {
  id: number;
  date: string;
  department: {
    id: number;
    name: string;
    code: string;
  };
  shiftType: {
    id: number;
    name: string;
  };
  assignedInstructors: Array<{
    id: number;
    displayName: string;
  }>;
  stats: {
    assignedCount: number;
    hasNotes: boolean;
  };
  description: string | null;
};

/**
 * Prismaから取得したシフトデータを整形する
 *
 * @description
 * データベースから取得したシフトデータを、APIレスポンス用の形式に整形します。
 * インストラクター名のフォーマット、日付の文字列化、統計情報の計算を行います。
 *
 * @param shifts - Prismaから取得したシフトデータの配列
 * @returns 整形後のシフトデータの配列
 *
 * @example
 * ```typescript
 * const rawShifts = await (await getPrisma()).shift.findMany({ ... });
 * const formatted = formatShiftsData(rawShifts);
 * ```
 */
export function formatShiftsData(shifts: RawShiftData[]): FormattedShiftData[] {
  return shifts.map((shift) => ({
    id: shift.id,
    date: formatDateString(shift.date),
    department: shift.department,
    shiftType: shift.shiftType,
    assignedInstructors: shift.shiftAssignments.map((assignment) => ({
      id: assignment.instructor.id,
      displayName: formatInstructorDisplayName(assignment.instructor),
    })),
    stats: {
      assignedCount: shift.shiftAssignments.length,
      hasNotes: shift.description !== null,
    },
    description: shift.description,
  }));
}

/**
 * シフトデータから部門別集計を計算する
 *
 * @description
 * 整形済みのシフトデータから、部門ごとのシフト数を集計します。
 *
 * @param formattedShifts - 整形済みのシフトデータの配列
 * @returns 部門名をキー、シフト数を値とするオブジェクト
 *
 * @example
 * ```typescript
 * const byDepartment = aggregateByDepartment(formattedShifts);
 * // { "スキー": 30, "スノーボード": 15 }
 * ```
 */
export function aggregateByDepartment(
  formattedShifts: FormattedShiftData[]
): Record<string, number> {
  const byDepartment: Record<string, number> = {};
  for (const shift of formattedShifts) {
    const deptName = shift.department.name;
    byDepartment[deptName] = (byDepartment[deptName] || 0) + 1;
  }
  return byDepartment;
}

/**
 * シフトデータから総アサイン数を計算する
 *
 * @description
 * 整形済みのシフトデータから、全シフトの総アサイン数（インストラクター配置数）を計算します。
 *
 * @param formattedShifts - 整形済みのシフトデータの配列
 * @returns 総アサイン数
 *
 * @example
 * ```typescript
 * const totalAssignments = calculateTotalAssignments(formattedShifts);
 * // 134
 * ```
 */
export function calculateTotalAssignments(
  formattedShifts: FormattedShiftData[]
): number {
  return formattedShifts.reduce(
    (sum, shift) => sum + shift.stats.assignedCount,
    0
  );
}
