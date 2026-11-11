import { addDays } from '@/features/shifts/view-utils';

import {
  collectWorkDates,
  isVisible,
  matchesDepartmentFilter,
  selectMemberIds,
  weekStartOf,
  type AnalysisFilters,
} from './aggregators';
import type { SeasonAnalysis } from './schema';

/**
 * 負担の集計（CONTEXT.md「負荷（Workload）」と同じ定義）。
 * - 連勤＝暦日で連続した勤務日（同日に複数枠へ入っても1日）
 * - 連続勤務週数＝1日でも勤務がある週（月曜始まり）が続く数。勤務のない週で途切れる
 *   （営業のない週も「休み」とみなし、スキップしない）
 * 部門・下書きフィルタは A（メンバー別の勤務日数）と同じ規則で適用する。しきい値は設けず数値をそのまま出す。
 */

/** 連勤1件（連続する勤務日の並び） */
export type DayRun = {
  /** 日数 */
  days: number;
  /** 開始日（YYYY-MM-DD） */
  from: string;
  /** 終了日（YYYY-MM-DD） */
  to: string;
  /** 予定の日（基準日以降）を含むか */
  includesFuture: boolean;
};

/** 連続勤務週1件（勤務のある週が続く並び） */
export type WeekRun = {
  /** 週数 */
  weeks: number;
  /** 最初の週の月曜日 */
  fromWeekStart: string;
  /** 最後の週の月曜日 */
  toWeekStart: string;
  /** 予定の勤務を含む週があるか */
  includesFuture: boolean;
};

/** ある週の勤務日数 */
export type WeekCell = {
  days: number;
  /** その週の勤務がすべて予定（基準日以降）か */
  plannedOnly: boolean;
};

/** メンバー1名分の負担 */
export type MemberBurden = {
  id: string;
  name: string;
  /** 最長の連勤（同じ長さなら最も早いもの） */
  maxRun: DayRun;
  /** 最長の連続勤務週（同じ長さなら最も早いもの） */
  maxWeekRun: WeekRun;
  /** 基準週から遡る連続勤務週数（実施済みの勤務のみで判定）。基準週に勤務がなければ 0 */
  recentWeekStreak: number;
  /** 週の月曜日 → その週の勤務日数 */
  weekCells: Map<string, WeekCell>;
};

/** 最大値とその該当者（要約表示用） */
export type BurdenTop = { value: number; names: string[] };

/** 負担の集計結果 */
export type BurdenView = {
  /** 最大連続勤務週の降順→最大連勤の降順→名前。勤務のないメンバーは含めない */
  members: MemberBurden[];
  /** 勤務がなく除外した対象メンバーの人数 */
  excludedCount: number;
  /** 人×週の列。部門フィルタ内で枠がある最初の週〜最後の週の月曜日（連続） */
  weeks: string[];
  /** 「直近の連続勤務週」の基準週（月曜日）。営業日がなければ null */
  baseWeek: string | null;
  maxRun: BurdenTop;
  maxWeekRun: BurdenTop;
};

/**
 * 日付の集合を連続する並びに分割する。
 * @param dates - 勤務日（YYYY-MM-DD）。重複・順不同可
 * @returns 開始日・終了日・日数の昇順リスト
 */
export function splitIntoRuns(dates: Iterable<string>): {
  from: string;
  to: string;
  days: number;
}[] {
  const sorted = [...new Set(dates)].sort();
  const runs: { from: string; to: string; days: number }[] = [];
  for (const date of sorted) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.to, 1) === date) {
      last.to = date;
      last.days += 1;
    } else {
      runs.push({ from: date, to: date, days: 1 });
    }
  }
  return runs;
}

/** 週の月曜日の集合を、連続する週の並びに分割する */
function splitIntoWeekRuns(weekStarts: Iterable<string>): {
  from: string;
  to: string;
  weeks: number;
}[] {
  const sorted = [...new Set(weekStarts)].sort();
  const runs: { from: string; to: string; weeks: number }[] = [];
  for (const week of sorted) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.to, 7) === week) {
      last.to = week;
      last.weeks += 1;
    } else {
      runs.push({ from: week, to: week, weeks: 1 });
    }
  }
  return runs;
}

/** 長さが最大の並びを返す。同じ長さなら先頭（最も早い）を採る */
function longest<T>(runs: T[], length: (run: T) => number): T | undefined {
  let best: T | undefined;
  for (const run of runs) {
    if (best === undefined || length(run) > length(best)) best = run;
  }
  return best;
}

/**
 * 「直近の連続勤務週」の基準週を求める。基準日より前に営業日（部門フィルタ内で枠がある日）を含む
 * 最も新しい週。今シーズンは基準日＝today、過去シーズンは基準日＝シーズン終了日の翌日として扱う
 * （＝シーズン内で最後に営業した週になる）。
 * @returns 週の月曜日。該当する営業日がなければ null
 */
export function resolveBaseWeek(data: SeasonAnalysis, filters: AnalysisFilters): string | null {
  const baseDate = data.today > data.seasonRange.to ? addDays(data.seasonRange.to, 1) : data.today;
  let latest: string | null = null;
  for (const shift of data.shifts) {
    if (
      !isVisible(shift.status, filters.includeDrafts) ||
      !matchesDepartmentFilter(shift.departmentCode, filters.department) ||
      shift.date >= baseDate
    ) {
      continue;
    }
    if (latest === null || shift.date > latest) latest = shift.date;
  }
  return latest === null ? null : weekStartOf(latest);
}

function topOf(members: MemberBurden[], value: (member: MemberBurden) => number): BurdenTop {
  const max = Math.max(0, ...members.map(value));
  return { value: max, names: members.filter((m) => value(m) === max).map((m) => m.name) };
}

/**
 * メンバーごとの最大連勤・週ごとの勤務日数・最大連続勤務週・直近の連続勤務週を求める。
 * @param data - API 応答
 * @param filters - 部門・下書き
 */
export function buildBurden(data: SeasonAnalysis, filters: AnalysisFilters): BurdenView {
  const memberIds = selectMemberIds(data, filters);
  const workDates = collectWorkDates(data, filters, memberIds);
  const nameById = new Map(data.instructors.map((i) => [i.id, i.displayName]));
  const baseWeek = resolveBaseWeek(data, filters);

  const members: MemberBurden[] = [];
  let excludedCount = 0;
  const activeWeeks = new Set<string>();
  for (const id of memberIds) {
    const dates = [...(workDates.get(id)?.keys() ?? [])];
    if (dates.length === 0) {
      excludedCount += 1;
      continue;
    }
    const weekDays = new Map<string, { days: number; plannedDays: number }>();
    for (const date of dates) {
      const week = weekStartOf(date);
      const cell = weekDays.get(week) ?? { days: 0, plannedDays: 0 };
      cell.days += 1;
      if (date >= data.today) cell.plannedDays += 1;
      weekDays.set(week, cell);
      activeWeeks.add(week);
    }
    const run = longest(splitIntoRuns(dates), (r) => r.days);
    const weekRun = longest(splitIntoWeekRuns(weekDays.keys()), (r) => r.weeks);
    if (!run || !weekRun) continue;

    // 直近の連続勤務週は実施済みの勤務がある週だけで判定する
    const pastWeeks = new Set(dates.filter((d) => d < data.today).map((d) => weekStartOf(d)));
    let recentWeekStreak = 0;
    if (baseWeek !== null) {
      for (let week = baseWeek; pastWeeks.has(week); week = addDays(week, -7)) {
        recentWeekStreak += 1;
      }
    }
    members.push({
      id,
      name: nameById.get(id) ?? id,
      maxRun: { days: run.days, from: run.from, to: run.to, includesFuture: run.to >= data.today },
      maxWeekRun: {
        weeks: weekRun.weeks,
        fromWeekStart: weekRun.from,
        toWeekStart: weekRun.to,
        includesFuture: [...weekDays.entries()].some(
          ([week, cell]) => cell.plannedDays > 0 && week >= weekRun.from && week <= weekRun.to,
        ),
      },
      recentWeekStreak,
      weekCells: new Map(
        [...weekDays].map(([week, cell]) => [
          week,
          { days: cell.days, plannedOnly: cell.plannedDays === cell.days },
        ]),
      ),
    });
  }
  members.sort(
    (a, b) =>
      b.maxWeekRun.weeks - a.maxWeekRun.weeks ||
      b.maxRun.days - a.maxRun.days ||
      a.name.localeCompare(b.name, 'ja'),
  );

  // 列は、部門フィルタ内で枠がある最初の週〜最後の週を連続して並べる
  const shiftWeeks = data.shifts
    .filter(
      (shift) =>
        isVisible(shift.status, filters.includeDrafts) &&
        matchesDepartmentFilter(shift.departmentCode, filters.department),
    )
    .map((shift) => weekStartOf(shift.date));
  const allWeeks = [...shiftWeeks, ...activeWeeks].sort();
  const weeks: string[] = [];
  const first = allWeeks[0];
  const last = allWeeks[allWeeks.length - 1];
  if (first !== undefined && last !== undefined) {
    for (let week = first; week <= last; week = addDays(week, 7)) weeks.push(week);
  }

  return {
    members,
    excludedCount,
    weeks,
    baseWeek,
    maxRun: topOf(members, (m) => m.maxRun.days),
    maxWeekRun: topOf(members, (m) => m.maxWeekRun.weeks),
  };
}
