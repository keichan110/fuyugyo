import type { ShiftAgendaDay, ShiftViewItem, ShiftViewSummary } from './schema';

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

/**
 * シフト配列をアジェンダ表示用の稼働日単位にまとめる。
 * @param shifts - 整形済みシフト配列
 * @returns Shift が 1 件以上ある日だけを日付昇順で並べたアジェンダ日配列
 */
export function groupShiftsByWorkingDay(shifts: ShiftViewItem[]): ShiftAgendaDay[] {
  const sorted = [...shifts].sort(compareShiftViewItems);
  const days = new Map<string, ShiftViewItem[]>();

  for (const shift of sorted) {
    const list = days.get(shift.date);
    if (list) {
      list.push(shift);
    } else {
      days.set(shift.date, [shift]);
    }
  }

  return Array.from(days, ([date, dayShifts]) => ({
    date,
    shifts: dayShifts,
  }));
}

/**
 * 指定 Instructor が Shift の割り当てに含まれるか判定する。
 * @param shift - 判定対象の Shift
 * @param instructorId - ログイン User にリンクされた Instructor ID。未リンクなら null
 * @returns 指定 Instructor が割り当てに含まれる場合 true
 */
export function containsInstructorAssignment(
  shift: ShiftViewItem,
  instructorId: string | null,
): boolean {
  if (!instructorId) {
    return false;
  }
  return shift.assignedInstructors.some((instructor) => instructor.id === instructorId);
}

/**
 * アジェンダを指定 Instructor の勤務だけに絞り込む。
 * @param days - アジェンダ日配列
 * @param instructorId - ログイン User にリンクされた Instructor ID。未リンクなら null
 * @returns 指定 Instructor を含む Shift だけを残したアジェンダ日配列
 */
export function filterAgendaDaysByInstructor(
  days: ShiftAgendaDay[],
  instructorId: string | null,
): ShiftAgendaDay[] {
  if (!instructorId) {
    return [];
  }

  return days
    .map((day) => ({
      ...day,
      shifts: day.shifts.filter((shift) => containsInstructorAssignment(shift, instructorId)),
    }))
    .filter((day) => day.shifts.length > 0);
}

function compareShiftViewItems(a: ShiftViewItem, b: ShiftViewItem): number {
  return (
    a.date.localeCompare(b.date) ||
    a.department.name.localeCompare(b.department.name, 'ja') ||
    a.shiftType.name.localeCompare(b.shiftType.name, 'ja')
  );
}
