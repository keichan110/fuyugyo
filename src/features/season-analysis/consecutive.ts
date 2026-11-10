import { addDays } from '@/features/shifts/view-utils';

import { collectWorkDates, selectMemberIds, type AnalysisFilters } from './aggregators';
import type { SeasonAnalysis } from './schema';

/**
 * 連勤の集計。連勤＝暦日で連続する勤務日の並び（同日に複数枠へ入っても1日）。
 * 負荷の数え方・下書き・部門フィルタは A（メンバー別の勤務日数）と同じ規則で適用する。
 */

/**
 * 連勤として注意する日数。自動割当ソルバー（`shifts/auto-assign-solver.ts` の連勤評価）が
 * 「4連勤以上」を回避対象にしているのと揃える。
 */
export const CONSECUTIVE_WORK_LIMIT = 4;

/** 連勤1件（連続する勤務日の並び） */
export type WorkRun = {
  instructorId: string;
  name: string;
  /** 開始日（YYYY-MM-DD） */
  from: string;
  /** 終了日（YYYY-MM-DD） */
  to: string;
  days: number;
  /** 実施済みの日を含むか */
  includesPast: boolean;
  /** 予定の日（基準日以降）を含むか */
  includesFuture: boolean;
};

/** メンバー別の連勤サマリー */
export type MemberStreak = {
  id: string;
  name: string;
  maxStreak: number;
  /** 4連勤以上の連勤の回数 */
  longRunCount: number;
};

/** 連勤の集計結果 */
export type ConsecutiveView = {
  /** 最大連勤の降順。勤務のないメンバーは含めない */
  members: MemberStreak[];
  /** 4連勤以上の連勤。開始日の昇順 */
  longRuns: WorkRun[];
};

/**
 * 日付の集合を連続する並びに分割する。
 * @param dates - 勤務日（YYYY-MM-DD）。重複・順不同可
 * @returns 開始日・終了日・日数の昇順リスト
 */
export function splitIntoRuns(
  dates: Iterable<string>,
): { from: string; to: string; days: number }[] {
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

/**
 * メンバーごとの最大連勤・4連勤以上の回数と、4連勤以上の期間一覧を求める。
 * @param data - API 応答
 * @param filters - 部門・下書き・負荷の数え方
 */
export function buildConsecutive(data: SeasonAnalysis, filters: AnalysisFilters): ConsecutiveView {
  const memberIds = selectMemberIds(data, filters);
  const workDates = collectWorkDates(data, filters, memberIds);
  const nameById = new Map(data.instructors.map((i) => [i.id, i.displayName]));
  const members: MemberStreak[] = [];
  const longRuns: WorkRun[] = [];
  for (const id of memberIds) {
    const name = nameById.get(id) ?? id;
    const runs = splitIntoRuns(workDates.get(id)?.keys() ?? []);
    if (runs.length === 0) continue;
    let longRunCount = 0;
    for (const run of runs) {
      if (run.days < CONSECUTIVE_WORK_LIMIT) continue;
      longRunCount += 1;
      longRuns.push({
        instructorId: id,
        name,
        ...run,
        includesPast: run.from < data.today,
        includesFuture: run.to >= data.today,
      });
    }
    members.push({
      id,
      name,
      maxStreak: Math.max(...runs.map((run) => run.days)),
      longRunCount,
    });
  }
  members.sort((a, b) => b.maxStreak - a.maxStreak || a.name.localeCompare(b.name, 'ja'));
  longRuns.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, 'ja'));
  return { members, longRuns };
}
