/**
 * 割り当て候補の負荷（Workload）を計算する純粋関数群。
 * DB からは Instructor ごとの勤務日だけを渡し、日付窓・連続判定はここに閉じ込める。
 */

export type WorkloadInput = {
  instructorId: string;
  targetDate: string;
  assignedDates: string[];
  seasonRange: SeasonRange;
  thresholds?: WorkloadWarningThresholds;
};

export type SeasonRange = {
  from: string;
  to: string;
};

export type WorkloadWarningThresholds = {
  monthlyWorkDays: number;
  seasonWorkDays: number;
  consecutiveWeekends: number;
  consecutiveWorkDays: number;
};

export type InstructorWorkload = {
  monthlyWorkDays: number;
  seasonWorkDays: number;
  consecutiveWeekends: number;
  consecutiveWorkDays: number;
  hasWarning: boolean;
};

export const DEFAULT_WORKLOAD_WARNING_THRESHOLDS: WorkloadWarningThresholds = {
  monthlyWorkDays: 12,
  seasonWorkDays: 40,
  consecutiveWeekends: 3,
  consecutiveWorkDays: 5,
};

/**
 * 対象日へ割り当てた後の想定負荷を計算する。
 * @param input - Instructor ID、対象日、既存勤務日、シーズン範囲、任意の警告閾値
 * @returns 月内・シーズン累計・連続週末・連続勤務日の 4 指標と警告有無
 */
export function calculateInstructorWorkload(input: WorkloadInput): InstructorWorkload {
  const thresholds = input.thresholds ?? DEFAULT_WORKLOAD_WARNING_THRESHOLDS;
  const dates = new Set(input.assignedDates);
  dates.add(input.targetDate);

  const monthlyWorkDays = countDatesInRange(dates, monthRange(input.targetDate));
  const seasonWorkDays = countDatesInRange(dates, input.seasonRange);
  const consecutiveWeekends = countConsecutiveWeekends(dates, input.targetDate);
  const consecutiveWorkDays = countConsecutiveWorkDays(dates, input.targetDate);

  return {
    monthlyWorkDays,
    seasonWorkDays,
    consecutiveWeekends,
    consecutiveWorkDays,
    hasWarning:
      monthlyWorkDays >= thresholds.monthlyWorkDays ||
      seasonWorkDays >= thresholds.seasonWorkDays ||
      consecutiveWeekends >= thresholds.consecutiveWeekends ||
      consecutiveWorkDays >= thresholds.consecutiveWorkDays,
  };
}

/**
 * 対象日を含む冬季シーズン範囲を返す。
 * @param targetDate - 対象日（YYYY-MM-DD）
 * @param startMonth - シーズン開始月（1〜12）
 * @param endMonth - シーズン終了月（1〜12）
 * @returns 対象日を含むシーズンの開始日・終了日
 */
export function seasonRangeForDate(targetDate: string, startMonth = 12, endMonth = 4): SeasonRange {
  const date = parseDate(targetDate);
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + 1;
  const wrapsYear = startMonth > endMonth;
  const startYear = wrapsYear && targetMonth < startMonth ? targetYear - 1 : targetYear;
  const endYear = wrapsYear ? startYear + 1 : startYear;

  return {
    from: formatDate(new Date(Date.UTC(startYear, startMonth - 1, 1))),
    to: formatDate(new Date(Date.UTC(endYear, endMonth, 0))),
  };
}

function countDatesInRange(dates: Set<string>, range: SeasonRange): number {
  let count = 0;
  for (const date of dates) {
    if (date >= range.from && date <= range.to) {
      count += 1;
    }
  }
  return count;
}

function countConsecutiveWorkDays(dates: Set<string>, targetDate: string): number {
  let count = 0;
  let cursor = targetDate;
  while (dates.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function countConsecutiveWeekends(dates: Set<string>, targetDate: string): number {
  let count = 0;
  let saturday = weekendAnchor(targetDate);

  while (weekendHasWork(dates, saturday)) {
    count += 1;
    saturday = addDays(saturday, -7);
  }

  return count;
}

function weekendHasWork(dates: Set<string>, saturday: string): boolean {
  return dates.has(saturday) || dates.has(addDays(saturday, 1));
}

function weekendAnchor(dateStr: string): string {
  const date = parseDate(dateStr);
  const weekday = date.getUTCDay();
  const daysFromSaturday = weekday === 6 ? 0 : weekday === 0 ? 1 : weekday + 1;
  return addDays(dateStr, -daysFromSaturday);
}

function monthRange(dateStr: string): SeasonRange {
  const date = parseDate(dateStr);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: formatDate(new Date(Date.UTC(year, month, 1))),
    to: formatDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
