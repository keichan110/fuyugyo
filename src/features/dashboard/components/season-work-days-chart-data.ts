import type { SeasonMonthlyWorkDays } from '@/features/shifts/schema';

/** 'YYYY-MM' を 'M月' 表示に整形する。 */
function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/**
 * 月別勤務日数と、その月までのシーズン通算勤務日数をグラフ用データに変換する。
 * @param monthlyTrend - シーズン開始月順の月別勤務日数
 */
export function buildSeasonWorkDaysChartData(
  monthlyTrend: SeasonMonthlyWorkDays[],
): { month: string; workDays: number; totalWorkDays: number }[] {
  let totalWorkDays = 0;

  return monthlyTrend.map((item) => {
    totalWorkDays += item.workDays;

    return {
      month: monthLabel(item.month),
      workDays: item.workDays,
      totalWorkDays,
    };
  });
}

/** 月別勤務日数と通算勤務日数をツールチップ用の表示文字列に整形する。 */
export function formatSeasonWorkDaysTooltip(
  month: string,
  workDays: number,
  totalWorkDays: number,
): string {
  return `${month} ${workDays}日 / 通算${totalWorkDays}日`;
}
