import type { ShiftViewItem, ShiftViewSummary } from './schema';

/**
 * シフト表示ビュー（週次/月次）の集計を担う純粋関数群。
 * DB アクセスを持たず整形済みのシフト配列だけを入力に取るため、単体テストが容易。
 * 旧 `usecases/helpers/shift-aggregators.ts` のロジックを新アーキテクチャへ移植したもの。
 */

/**
 * 部門名ごとのシフト件数を集計する。
 * @param shifts - 整形済みシフト配列
 * @returns 部門名をキー、シフト件数を値とするオブジェクト（同名部門は合算）
 */
export function aggregateByDepartment(shifts: ShiftViewItem[]): Record<string, number> {
  const byDepartment: Record<string, number> = {};
  for (const shift of shifts) {
    const name = shift.department.name;
    byDepartment[name] = (byDepartment[name] ?? 0) + 1;
  }
  return byDepartment;
}

/**
 * 全シフトの割り当て総数（Instructor 配置数の合計）を計算する。
 * @param shifts - 整形済みシフト配列
 * @returns 割り当て総数
 */
export function calculateTotalAssignments(shifts: ShiftViewItem[]): number {
  return shifts.reduce((sum, shift) => sum + shift.assignedInstructors.length, 0);
}

/**
 * シフト配列と対象期間から表示ビューのサマリ（件数・割り当て総数・部門別集計）を組み立てる。
 * @param shifts - 整形済みシフト配列
 * @param dateRange - 対象期間（YYYY-MM-DD）
 * @returns 表示ビューのサマリ
 */
export function summarizeShifts(
  shifts: ShiftViewItem[],
  dateRange: { from: string; to: string },
): ShiftViewSummary {
  return {
    totalShifts: shifts.length,
    totalAssignments: calculateTotalAssignments(shifts),
    dateRange,
    byDepartment: aggregateByDepartment(shifts),
  };
}
