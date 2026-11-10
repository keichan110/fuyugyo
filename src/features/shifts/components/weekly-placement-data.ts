import { shortDateLabel, weekdayIndex } from '../view-utils';
import type { WorkEntry } from '../workload';

/** 表示月の勤務日を月曜始まりの週にまとめる。各分類内では同日の複数勤務を1日として数える。 */
export function weeklyPlacementData(
  days: readonly string[],
  monthWork: ReadonlyMap<string, readonly WorkEntry[]>,
  current: { departmentCode: string; shiftTypeId: string },
) {
  const weeks: {
    week: string;
    current: number;
    sameDepartmentOtherType: number;
    otherDepartment: number;
  }[] = [];
  for (const date of days) {
    if (weeks.length === 0 || weekdayIndex(date) === 1) {
      weeks.push({
        week: `${shortDateLabel(date)}〜`,
        current: 0,
        sameDepartmentOtherType: 0,
        otherDepartment: 0,
      });
    }
    const week = weeks[weeks.length - 1];
    if (!week) continue;
    const entries = monthWork.get(date) ?? [];
    if (
      entries.some(
        (entry) =>
          entry.departmentCode === current.departmentCode &&
          entry.shiftTypeId !== current.shiftTypeId,
      )
    )
      week.sameDepartmentOtherType += 1;
    if (entries.some((entry) => entry.departmentCode !== current.departmentCode))
      week.otherDepartment += 1;
    if (
      entries.some(
        (entry) =>
          entry.departmentCode === current.departmentCode &&
          entry.shiftTypeId === current.shiftTypeId,
      )
    )
      week.current += 1;
  }
  return weeks;
}
