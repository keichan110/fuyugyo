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

/** 連勤の算出結果（基準日を含む暦日連続の勤務） */
export type WorkStreak = {
  days: number;
  from: string;
  to: string;
};

/** 連続勤務週数の算出結果。週は月曜始まりで、`*WeekStart` は各端の週の月曜日 */
export type WorkWeekStreak = {
  weeks: number;
  fromWeekStart: string;
  toWeekStart: string;
};

/**
 * 基準日を含む連勤（暦日で連続した勤務）を返す。基準日は勤務として数える
 * （「追加した場合」は呼び出し側が基準日を加えた集合を渡す）。前後両方向へ月をまたいで連結し、
 * シーズン範囲の端で打ち切る。
 * @param workDates - 勤務日（YYYY-MM-DD）。重複・順不同可
 * @param baseDate - 基準日（YYYY-MM-DD）
 * @param season - 打ち切りに使うシーズン範囲
 * @returns 基準日を含む連勤の日数と開始・終了日
 */
export function computeWorkStreak(
  workDates: Iterable<string>,
  baseDate: string,
  season: SeasonRange,
): WorkStreak {
  const dates = new Set(workDates);
  dates.add(baseDate);
  let from = baseDate;
  let to = baseDate;
  for (;;) {
    const prev = addDaysToDate(from, -1);
    if (prev < season.from || !dates.has(prev)) break;
    from = prev;
  }
  for (;;) {
    const next = addDaysToDate(to, 1);
    if (next > season.to || !dates.has(next)) break;
    to = next;
  }
  return { days: daysBetween(from, to) + 1, from, to };
}

/**
 * 基準日を含む週（月曜始まり〜日曜）から前後へ、1日でも勤務がある週が続く数を返す。
 * 基準日の週は基準日を勤務として含めるため必ず勤務週になる。シーズン範囲外の勤務日は数えない。
 * @param workDates - 勤務日（YYYY-MM-DD）。重複・順不同可
 * @param baseDate - 基準日（YYYY-MM-DD）
 * @param season - 打ち切りに使うシーズン範囲
 * @returns 連続する勤務週の数と、両端の週の月曜日
 */
export function computeWorkWeekStreak(
  workDates: Iterable<string>,
  baseDate: string,
  season: SeasonRange,
): WorkWeekStreak {
  const weekStarts = new Set<string>([weekStartOf(baseDate)]);
  for (const date of workDates) {
    if (date >= season.from && date <= season.to) {
      weekStarts.add(weekStartOf(date));
    }
  }
  const base = weekStartOf(baseDate);
  let fromWeekStart = base;
  let toWeekStart = base;
  // 週の月曜日同士を7日刻みで辿り、勤務のない週で止める
  while (weekStarts.has(addDaysToDate(fromWeekStart, -7))) {
    fromWeekStart = addDaysToDate(fromWeekStart, -7);
  }
  while (weekStarts.has(addDaysToDate(toWeekStart, 7))) {
    toWeekStart = addDaysToDate(toWeekStart, 7);
  }
  return { weeks: daysBetween(fromWeekStart, toWeekStart) / 7 + 1, fromWeekStart, toWeekStart };
}

/** 当月のセル単位の割り当て（表示用の部門名・種別名つき） */
export type DetailedCellAssignment = CellAssignment & {
  departmentName?: string;
  shiftTypeName: string;
};

/** ある人のある日の勤務1件（どの部門・種別か） */
export type WorkEntry = {
  departmentCode: string;
  departmentName?: string;
  shiftTypeId: string;
  shiftTypeName: string;
};

/**
 * 当月の指定 Instructor の勤務を日付別に合成する。
 * 現部門でステージ済みのセルは対応する保存済みセルを上書きする（`countCurrentMonthWorkDays` と同じ規則）。
 * @param savedAssignments - 当月の保存済み割り当て（全部門）
 * @param stagedAssignments - 現部門のステージ済みセル（未保存の編集内容）
 * @param instructorId - 対象 Instructor
 * @returns 日付 → その日の勤務一覧（勤務のない日は含まない）
 */
export function composeInstructorMonthWork(
  savedAssignments: DetailedCellAssignment[],
  stagedAssignments: DetailedCellAssignment[],
  instructorId: string,
): Map<string, WorkEntry[]> {
  const stagedKeys = new Set(
    stagedAssignments.map((a) => cellAssignmentKey(a.departmentCode, a.date, a.shiftTypeId)),
  );
  const byDate = new Map<string, WorkEntry[]>();
  const add = (assignment: DetailedCellAssignment) => {
    if (!assignment.instructorIds.includes(instructorId)) return;
    const entries = byDate.get(assignment.date) ?? [];
    entries.push({
      departmentCode: assignment.departmentCode,
      ...(assignment.departmentName === undefined
        ? {}
        : { departmentName: assignment.departmentName }),
      shiftTypeId: assignment.shiftTypeId,
      shiftTypeName: assignment.shiftTypeName,
    });
    byDate.set(assignment.date, entries);
  };
  for (const assignment of savedAssignments) {
    // ステージ済みセルはステージ値を正とするため、保存値は取り込まない
    if (
      stagedKeys.has(
        cellAssignmentKey(assignment.departmentCode, assignment.date, assignment.shiftTypeId),
      )
    ) {
      continue;
    }
    add(assignment);
  }
  for (const assignment of stagedAssignments) {
    add(assignment);
  }
  return byDate;
}

/** 日ごとの勤務の分類。表示中の部門・種別 / 同部門の別種別 / 別部門 */
export type WorkDayKind = 'current' | 'sameDepartmentOtherType' | 'otherDepartment';

/**
 * 1日分の勤務一覧を、タイムラインの代表アイコン用に分類する。
 * 同日に複数ある場合は current > otherDepartment > sameDepartmentOtherType の優先で代表を選ぶ。
 * @param entries - その日の勤務一覧
 * @param current - 表示中の部門・種別
 * @returns 勤務がなければ null
 */
export function classifyWorkDay(
  entries: WorkEntry[] | undefined,
  current: { departmentCode: string; shiftTypeId: string },
): WorkDayKind | null {
  if (!entries || entries.length === 0) return null;
  if (
    entries.some(
      (e) => e.departmentCode === current.departmentCode && e.shiftTypeId === current.shiftTypeId,
    )
  ) {
    return 'current';
  }
  if (entries.some((e) => e.departmentCode !== current.departmentCode)) {
    return 'otherDepartment';
  }
  return 'sameDepartmentOtherType';
}

/** 選択した人の負荷サマリ */
export type InstructorWorkloadSummary = {
  /** 当月勤務日数（現在案） */
  monthDays: number;
  /** シーズン勤務日数（現在案。月外の保存済み＋当月） */
  seasonDays: number;
  /** 選択枠に未配置で、連勤・週数が「追加した場合」の値であるか。選択枠なしなら false */
  isAddition: boolean;
  /** 選択枠に追加すると増える勤務日数（同日に別勤務があれば 0）。未配置でなければ 0 */
  addedDays: number;
  /** 連勤。選択枠がなければ null */
  streak: WorkStreak | null;
  /** 連続勤務週数。選択枠がなければ null */
  weekStreak: WorkWeekStreak | null;
};

/**
 * 選択した人の当月・シーズン勤務日数と、選択枠を基準にした連勤・連続勤務週数を求める。
 * 選択枠に未配置なら連勤・週数は選択日を加えた値、日数は現在案のまま「追加すると +N日」を返す。
 * @param params.monthWork - {@link composeInstructorMonthWork} の結果（当月の現在案）
 * @param params.workDatesOutsideMonth - API が返す月外の保存済み勤務日
 * @param params.season - 表示月を含むシーズン範囲
 * @param params.selectedDate - 選択枠の日付。なければ null
 * @param params.current - 選択枠の部門・種別
 */
export function summarizeInstructorWorkload(params: {
  monthWork: Map<string, WorkEntry[]>;
  workDatesOutsideMonth: string[];
  season: SeasonRange;
  selectedDate: string | null;
  current: { departmentCode: string; shiftTypeId: string };
}): InstructorWorkloadSummary {
  const { monthWork, workDatesOutsideMonth, season, selectedDate, current } = params;
  const monthDays = monthWork.size;
  const seasonDays = workDatesOutsideMonth.length + monthDays;
  if (selectedDate === null) {
    return {
      monthDays,
      seasonDays,
      isAddition: false,
      addedDays: 0,
      streak: null,
      weekStreak: null,
    };
  }
  const isPlaced = classifyWorkDay(monthWork.get(selectedDate), current) === 'current';
  const allDates = [...workDatesOutsideMonth, ...monthWork.keys()];
  // 未配置なら選択日を勤務に加えた集合で計算する（配置済みなら既に含まれる）
  const dates = isPlaced ? allDates : [...allDates, selectedDate];
  return {
    monthDays,
    seasonDays,
    isAddition: !isPlaced,
    addedDays: !isPlaced && !monthWork.has(selectedDate) ? 1 : 0,
    streak: computeWorkStreak(dates, selectedDate, season),
    weekStreak: computeWorkWeekStreak(dates, selectedDate, season),
  };
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

/** YYYY-MM-DD に日数を加算した YYYY-MM-DD を返す（UTC 基準） */
function addDaysToDate(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/** 2つの YYYY-MM-DD の暦日差（to - from） */
function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** 日付を含む週の月曜日（月曜始まり）を返す */
function weekStartOf(dateStr: string): string {
  const weekday = parseDate(dateStr).getUTCDay();
  return addDaysToDate(dateStr, -((weekday + 6) % 7));
}
