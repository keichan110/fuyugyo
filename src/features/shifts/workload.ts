import { SEASON_END_MONTH, SEASON_START_MONTH } from './season';

/**
 * 割り当て候補の負荷（Workload）を計算する純粋関数群。
 *
 * 負荷（総勤務日数）は「API が返す月外・保存済みの土台」＋「フロントが当月をライブ計算する分」
 * の合算で成り立つ。月単位でまとめて編集する UI 特性上、ステージ中（未保存）の変更を
 * 即座に反映する必要があるため、当月分の集計はこのモジュールの `countCurrentMonthWorkDays`
 * がフロント側で担い、月外の集計は `src/features/shifts/api.ts` が `seasonRangeForDate` と
 * 組み合わせて担う（サーバー・クライアントどちらからも参照するため isomorphic に保つ）。
 */

export type SeasonRange = {
  from: string;
  to: string;
};

/**
 * 対象日を含むシーズン範囲を返す。
 * @param targetDate - 対象日（YYYY-MM-DD）
 * @param startMonth - シーズン開始月（1〜12）。省略時は `SEASON_START_MONTH`
 * @param endMonth - シーズン終了月（1〜12）。省略時は `SEASON_END_MONTH`
 * @returns 対象日を含むシーズンの開始日・終了日
 */
export function seasonRangeForDate(
  targetDate: string,
  startMonth = SEASON_START_MONTH,
  endMonth = SEASON_END_MONTH,
): SeasonRange {
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

/**
 * プールの総勤務日数から1人あたりの公平な持ち分（フェアシェア）を返す。
 * 現状は単純平均（全員が同条件で出勤可能という前提）。
 * 将来 availability を導入したら、ここを出勤可能日数に応じた期待値へ差し替える。
 * @param workDays - 候補プール各人の総勤務日数
 * @returns フェアシェア（1人あたりの公平な勤務日数）。プールが空なら 0
 */
export function calculateFairShare(workDays: number[]): number {
  if (workDays.length === 0) {
    return 0;
  }
  return workDays.reduce((sum, days) => sum + days, 0) / workDays.length;
}

/** 月マトリクスの1セル分の割り当て（Instructor 別の当月勤務日数集計に使う最小情報） */
export type CellAssignment = {
  date: string;
  departmentCode: string;
  shiftTypeId: string;
  instructorIds: string[];
};

/**
 * 当月の勤務日数を Instructor 別に数える。
 * 現部門でステージ済みのセル（`stagedAssignments`）は、対応する保存済みセルを上書きする
 * （未保存の割り当て変更を即座に負荷計算へ反映するため）。同日に複数シフトへ入っていても
 * その日は1日として数える。
 * @param savedAssignments - 当月の保存済み割り当て（全部門）
 * @param stagedAssignments - 現部門のステージ済みセル（未保存の編集内容）
 * @returns Instructor ID → 当月の勤務日数
 */
export function countCurrentMonthWorkDays(
  savedAssignments: CellAssignment[],
  stagedAssignments: CellAssignment[],
): Map<string, number> {
  const stagedKeys = new Set(
    stagedAssignments.map((a) => cellAssignmentKey(a.departmentCode, a.date, a.shiftTypeId)),
  );

  const datesByInstructor = new Map<string, Set<string>>();
  const addDate = (instructorId: string, date: string) => {
    const dates = datesByInstructor.get(instructorId) ?? new Set<string>();
    dates.add(date);
    datesByInstructor.set(instructorId, dates);
  };

  for (const assignment of savedAssignments) {
    // ステージ済みセルは保存値ではなくステージ値を正とするため、ここでは数えない
    if (
      stagedKeys.has(
        cellAssignmentKey(assignment.departmentCode, assignment.date, assignment.shiftTypeId),
      )
    ) {
      continue;
    }
    for (const instructorId of assignment.instructorIds) {
      addDate(instructorId, assignment.date);
    }
  }
  for (const assignment of stagedAssignments) {
    for (const instructorId of assignment.instructorIds) {
      addDate(instructorId, assignment.date);
    }
  }

  const counts = new Map<string, number>();
  for (const [instructorId, dates] of datesByInstructor) {
    counts.set(instructorId, dates.size);
  }
  return counts;
}

function cellAssignmentKey(departmentCode: string, date: string, shiftTypeId: string): string {
  return `${departmentCode}:${date}:${shiftTypeId}`;
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
