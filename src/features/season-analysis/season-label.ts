import { seasonName } from '@/features/shifts/season';
import { seasonRangeForDate } from '@/features/shifts/workload';

/** シーズンの選択肢として「今シーズンから遡る」シーズン数（今シーズンを含む） */
const SELECTABLE_SEASON_COUNT = 4;

/**
 * 基準日を含むシーズンの開始年を返す。
 * @param today - 基準日（YYYY-MM-DD）
 */
export function currentSeasonStartYear(today: string): number {
  return Number(seasonRangeForDate(today).from.slice(0, 4));
}

/**
 * シーズン選択肢（今シーズンから過去3シーズン）。URL で指定された範囲外の年も選択肢に含める。
 * @param today - 基準日（YYYY-MM-DD）
 * @param selected - 現在選択中のシーズン開始年
 */
export function seasonOptions(today: string, selected: number): { value: string; label: string }[] {
  const current = currentSeasonStartYear(today);
  const years = Array.from({ length: SELECTABLE_SEASON_COUNT }, (_, index) => current - index);
  if (!years.includes(selected)) years.push(selected);
  return years.map((year) => ({ value: String(year), label: seasonName(year) }));
}
