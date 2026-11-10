import { SEASON_START_MONTH } from '@/features/shifts/season';
import { addDays } from '@/features/shifts/view-utils';

import { collectWorkDates, selectMemberIds, type AnalysisFilters } from './aggregators';
import type { SeasonAnalysis } from './schema';

/**
 * 前シーズンとの比較。選択シーズンが進行中なら、両シーズンとも「シーズン開始〜基準日の前日」
 * （前シーズンは1年前にずらす）の実施済みだけで比べる。過去シーズンなら両方シーズン全期間。
 * 対象メンバーとフィルタは A と同じ定義を各シーズンに適用する。
 */

/** 比較期間（両端含む） */
export type DateWindow = { from: string; to: string };

/** 比較の期間設定 */
export type ComparisonPeriod = {
  /** `toDate`: 進行中シーズンの基準日前日まで。`fullSeason`: シーズン全期間 */
  mode: 'toDate' | 'fullSeason';
  current: DateWindow;
  previous: DateWindow;
};

/** 月別の延べ勤務日数（比較用） */
export type MonthlyComparison = {
  /** 月（1〜12）。シーズン開始月から順に並べる */
  month: number;
  current: number;
  previous: number;
  /** 選択シーズンの予定分（基準日以降）。比較には含めない */
  currentPlanned: number;
};

/** メンバー別の増減 */
export type MemberChange = {
  id: string;
  name: string;
  current: number;
  previous: number;
  diff: number;
  /** 前シーズンに配置がない（新規）か */
  isNew: boolean;
};

/** 比較結果 */
export type ComparisonView = {
  period: ComparisonPeriod;
  months: MonthlyComparison[];
  members: MemberChange[];
  /** 前シーズンの比較期間内に勤務が1件もないか */
  previousIsEmpty: boolean;
};

/** 日付文字列の年を1年戻す（文字列比較にしか使わないため存在しない日付になっても構わない） */
function shiftYearBack(date: string): string {
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

/**
 * 比較期間を決める。
 * @param current - 選択シーズンのデータ
 */
export function resolveComparisonPeriod(current: SeasonAnalysis): ComparisonPeriod {
  const previousRange = {
    from: shiftYearBack(current.seasonRange.from),
    to: shiftYearBack(current.seasonRange.to),
  };
  if (current.today > current.seasonRange.to) {
    return { mode: 'fullSeason', current: current.seasonRange, previous: previousRange };
  }
  const to = addDays(current.today, -1);
  return {
    mode: 'toDate',
    current: { from: current.seasonRange.from, to },
    previous: { from: previousRange.from, to: shiftYearBack(to) },
  };
}

/** 人別の勤務日（Set）を作る。窓が null なら絞り込まない */
function workDatesByMember(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
): { ids: Set<string>; dates: Map<string, Set<string>> } {
  const ids = selectMemberIds(data, filters);
  const dates = new Map<string, Set<string>>();
  for (const [id, byDate] of collectWorkDates(data, filters, ids)) {
    dates.set(id, new Set(byDate.keys()));
  }
  return { ids, dates };
}

function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.from && date <= window.to;
}

function countInWindow(dates: ReadonlySet<string> | undefined, window: DateWindow): number {
  let count = 0;
  for (const date of dates ?? []) if (inWindow(date, window)) count += 1;
  return count;
}

/**
 * 選択シーズンと前シーズンを比較する。
 * @param current - 選択シーズンのデータ
 * @param previous - 前シーズンのデータ。未取得なら空として扱う
 * @param filters - 両シーズンに同じく適用するフィルタ
 */
export function buildComparison(
  current: SeasonAnalysis,
  previous: SeasonAnalysis | undefined,
  filters: AnalysisFilters,
): ComparisonView {
  const period = resolveComparisonPeriod(current);
  const currentWork = workDatesByMember(current, filters);
  const previousWork = previous
    ? workDatesByMember(previous, filters)
    : { ids: new Set<string>(), dates: new Map<string, Set<string>>() };

  // 月別: 月番号ごとに延べ勤務日数（人×日）を数える
  const monthTotals = new Map<number, Omit<MonthlyComparison, 'month'>>();
  const bump = (date: string, key: 'current' | 'previous' | 'currentPlanned') => {
    const month = Number(date.slice(5, 7));
    const total = monthTotals.get(month) ?? { current: 0, previous: 0, currentPlanned: 0 };
    total[key] += 1;
    monthTotals.set(month, total);
  };
  for (const dates of currentWork.dates.values()) {
    for (const date of dates) {
      if (inWindow(date, period.current)) bump(date, 'current');
      else if (date >= current.today) bump(date, 'currentPlanned');
    }
  }
  // 前シーズンの月別は全期間を出し、今シーズンの今後の月（予定）と見比べられるようにする。
  // 比較期間で揃えるのはメンバー別の増減だけ
  for (const dates of previousWork.dates.values()) {
    for (const date of dates) bump(date, 'previous');
  }
  const months = [...monthTotals.entries()]
    .map(([month, total]) => ({ month, ...total }))
    // シーズン開始月を先頭にして年をまたいで並べる
    .sort(
      (a, b) =>
        ((a.month - SEASON_START_MONTH + 12) % 12) - ((b.month - SEASON_START_MONTH + 12) % 12),
    );

  const nameById = new Map(
    [...current.instructors, ...(previous?.instructors ?? [])].map((i) => [i.id, i.displayName]),
  );
  const ids = new Set([...currentWork.ids, ...previousWork.ids]);
  const members: MemberChange[] = [...ids].map((id) => {
    const currentDays = countInWindow(currentWork.dates.get(id), period.current);
    const previousDays = countInWindow(previousWork.dates.get(id), period.previous);
    return {
      id,
      name: nameById.get(id) ?? id,
      current: currentDays,
      previous: previousDays,
      diff: currentDays - previousDays,
      isNew: previousDays === 0 && currentDays > 0,
    };
  });
  members.sort((a, b) => b.diff - a.diff || a.name.localeCompare(b.name, 'ja'));

  return {
    period,
    months,
    members,
    previousIsEmpty: members.every((member) => member.previous === 0),
  };
}
