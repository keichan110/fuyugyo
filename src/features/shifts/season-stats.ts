import { seasonRangeForDate, type SeasonRange } from './workload';

/**
 * ダッシュボード「今シーズン」セクションの集計を担う純粋関数群（Issue #203）。
 * DB アクセスを持たず、Shift × ShiftAssignment を JOIN して平坦化した行配列だけを
 * 入力に取るため単体テストが容易（`aggregators.ts` と同じ設計方針）。
 *
 * 集計単位は2種類を使い分ける:
 * - サマリー・月別推移・通算トレンド → 勤務日数（同日に複数シフトへ入っても1日として数える）
 * - 勤務内訳 → 勤務回数（同日複数シフトはそれぞれ1件として数える）
 */

/** 集計対象の入力行（対象 Instructor の Shift × ShiftAssignment を平坦化したもの） */
export type SeasonStatsSourceRow = {
  /** 勤務日（YYYY-MM-DD） */
  date: string;
  departmentCode: string;
  shiftTypeId: string;
  shiftTypeName: string;
};

/** 月別勤務日数（推移グラフの1点） */
export type MonthlyWorkDays = {
  /** 対象月（YYYY-MM） */
  month: string;
  workDays: number;
};

/** 部門とシフト種別の組み合わせ別の勤務回数内訳（円グラフの1セグメント） */
export type WorkBreakdownItem = {
  departmentCode: string;
  shiftTypeId: string;
  shiftTypeName: string;
  count: number;
};

/** 今シーズンの勤務実績サマリー（今月/今シーズンと前月/前シーズンの比較） */
export type SeasonStatsSummary = {
  currentMonthWorkDays: number;
  previousMonthWorkDays: number;
  currentSeasonWorkDays: number;
  /** 前シーズン開始日から、基準日を1年前にずらした日までの勤務日数 */
  previousSeasonToDateWorkDays: number;
  /** 前シーズン全期間の勤務日数 */
  previousSeasonWorkDays: number;
  currentSeasonRange: SeasonRange;
  previousSeasonRange: SeasonRange;
};

/** 「今シーズン」セクションの集計結果 */
export type SeasonStats = {
  summary: SeasonStatsSummary;
  /** 今シーズン内の月別勤務日数（シーズン開始月→終了月の順。データがない月も 0 で含む） */
  monthlyTrend: MonthlyWorkDays[];
  breakdown: WorkBreakdownItem[];
};

/**
 * 今シーズン・前シーズンの勤務行から、サマリー・月別推移・勤務内訳を組み立てる。
 * @param rows - 対象 Instructor の [前シーズン開始, 今シーズン終了] 範囲の勤務行
 * @param today - 基準日（YYYY-MM-DD）。通常はサーバーの当日
 * @returns 今シーズンセクション向けの集計結果
 */
export function buildSeasonStats(rows: SeasonStatsSourceRow[], today: string): SeasonStats {
  const currentSeasonRange = seasonRangeForDate(today);
  const previousSeasonRange = shiftSeasonRangeByYears(currentSeasonRange, -1);
  const previousSeasonToDateRange = {
    from: previousSeasonRange.from,
    to: shiftYearInDateString(today, -1),
  };

  const currentMonth = today.slice(0, 7);
  const previousMonth = shiftMonthString(currentMonth, -1);

  const currentSeasonRows = rows.filter(
    (row) => isWithinRange(row.date, currentSeasonRange) && row.date <= today,
  );
  const previousSeasonRows = rows.filter((row) => isWithinRange(row.date, previousSeasonRange));

  return {
    summary: {
      currentMonthWorkDays: countDistinctDates(
        rows.filter((row) => row.date.startsWith(currentMonth) && row.date <= today),
      ),
      previousMonthWorkDays: countDistinctDates(
        rows.filter((row) => row.date.startsWith(previousMonth)),
      ),
      currentSeasonWorkDays: countDistinctDates(currentSeasonRows),
      previousSeasonToDateWorkDays: countDistinctDates(
        rows.filter((row) => isWithinRange(row.date, previousSeasonToDateRange)),
      ),
      previousSeasonWorkDays: countDistinctDates(previousSeasonRows),
      currentSeasonRange,
      previousSeasonRange,
    },
    monthlyTrend: buildMonthlyTrend(currentSeasonRows, currentSeasonRange),
    breakdown: aggregateWorkBreakdown(currentSeasonRows),
  };
}

/** 日付（YYYY-MM-DD）が range（両端含む）に収まるか判定する。文字列比較で日付順と一致する */
function isWithinRange(date: string, range: SeasonRange): boolean {
  return date >= range.from && date <= range.to;
}

/** 行配列に含まれる勤務日（YYYY-MM-DD）の重複を除いた件数（=勤務日数） */
function countDistinctDates(rows: SeasonStatsSourceRow[]): number {
  return new Set(rows.map((row) => row.date)).size;
}

/**
 * シーズン範囲の年だけを移動する（前シーズンの算出用）。
 * シーズン境界（9/1, 8/31）はうるう年の影響を受けないため、年を足し引きするだけで安全に求まる。
 */
function shiftSeasonRangeByYears(range: SeasonRange, deltaYears: number): SeasonRange {
  return {
    from: shiftYearInDateString(range.from, deltaYears),
    to: shiftYearInDateString(range.to, deltaYears),
  };
}

function shiftYearInDateString(dateStr: string, deltaYears: number): string {
  const year = Number(dateStr.slice(0, 4)) + deltaYears;
  return `${String(year).padStart(4, '0')}${dateStr.slice(4)}`;
}

/** 月文字列（YYYY-MM）を指定月数だけ移動する */
function shiftMonthString(monthStr: string, deltaMonths: number): string {
  const year = Number(monthStr.slice(0, 4));
  const month = Number(monthStr.slice(5, 7));
  const zeroBasedTotal = year * 12 + (month - 1) + deltaMonths;
  const shiftedYear = Math.floor(zeroBasedTotal / 12);
  const shiftedMonth = (zeroBasedTotal % 12) + 1;
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/** from〜to（YYYY-MM-DD）が属する月（YYYY-MM）を昇順で列挙する */
function enumerateMonths(fromDateStr: string, toDateStr: string): string[] {
  const months: string[] = [];
  let cursor = fromDateStr.slice(0, 7);
  const end = toDateStr.slice(0, 7);
  while (cursor <= end) {
    months.push(cursor);
    cursor = shiftMonthString(cursor, 1);
  }
  return months;
}

/** シーズン範囲内の全月（データがない月も含む）について、月別勤務日数を組み立てる */
function buildMonthlyTrend(rows: SeasonStatsSourceRow[], range: SeasonRange): MonthlyWorkDays[] {
  const datesByMonth = new Map<string, Set<string>>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const dates = datesByMonth.get(month) ?? new Set<string>();
    dates.add(row.date);
    datesByMonth.set(month, dates);
  }

  return enumerateMonths(range.from, range.to).map((month) => ({
    month,
    workDays: datesByMonth.get(month)?.size ?? 0,
  }));
}

/** 部門とシフト種別の組み合わせ別に勤務回数を、件数の多い順で集計する */
function aggregateWorkBreakdown(rows: SeasonStatsSourceRow[]): WorkBreakdownItem[] {
  const counts = new Map<string, WorkBreakdownItem>();
  for (const row of rows) {
    const key = `${row.departmentCode}:${row.shiftTypeId}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        departmentCode: row.departmentCode,
        shiftTypeId: row.shiftTypeId,
        shiftTypeName: row.shiftTypeName,
        count: 1,
      });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}
