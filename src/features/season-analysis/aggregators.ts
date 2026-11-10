import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';
import { addDays, weekdayIndex } from '@/features/shifts/view-utils';

import type { SeasonAnalysis } from './schema';

/**
 * シーズン分析の画面用データを組み立てる純粋関数群。
 * 入力は API が返す集計前の事実データとフィルタだけで、DB・UI に依存しない。
 * 集計の定義を画面を見ながら差し替えやすいよう、指標ごとに関数を分けている。
 *
 * 定義:
 * - 配置は実績とみなす。基準日（today）より前を「実施済み」、today 以降を「予定」とする
 * - 勤務日数は同日に複数枠へ入っても1日（`season-stats.ts` と同じ）
 */

/** 部門フィルタ。`all` は全体 */
export type DepartmentFilter = 'all' | DepartmentCode;

/** 個人の負荷の数え方。全部門で数えるか、選択部門のみで数えるか */
export type CountScope = 'allDepartments' | 'selectedDepartment';

/** 画面のフィルタ状態 */
export type AnalysisFilters = {
  department: DepartmentFilter;
  includeDrafts: boolean;
  countScope: CountScope;
};

/** 実施済み・予定の日数 */
export type PhaseDays = { past: number; future: number };

/** 人×月の1セル */
export type MemberMonthCell = PhaseDays & {
  month: string;
  /** 実施済み＋予定の勤務日数 */
  total: number;
  /** その月の対象メンバー中央値との差（正=多い、負=少ない） */
  diff: number;
  /** その月に最も多く勤務した部門。勤務がなければ null */
  topDepartment: DepartmentCode | null;
};

/** メンバー1名分の集計 */
export type MemberSummary = PhaseDays & {
  id: string;
  name: string;
  total: number;
  /** 部門別の勤務日数（同日に複数部門へ入ると合算は total を超えうる） */
  departmentDays: Record<DepartmentCode, number>;
  /** 勤務可能日数（枠のある日のうち UNAVAILABLE 申告のない日。AVOID を含む） */
  availableDays: number;
  /** 勤務可能日数のうち「要調整」の日数 */
  avoidDays: number;
  months: MemberMonthCell[];
};

/** 充足率（requiredCount が null の枠は除外）。必要人数が 0 なら null */
export type FillRate = { required: number; assigned: number; rate: number | null };

/** 週ごとの充足状況 */
export type WeeklyStaffing = {
  /** 週の月曜日（YYYY-MM-DD） */
  weekStart: string;
  /** 実施済み（週末が today より前）／進行中（today を含む）／予定（週初が today 以降） */
  phase: 'past' | 'current' | 'future';
  required: number;
  assigned: number;
  /** 配置が必要人数に満たない枠の数 */
  shortageSlots: number;
};

/** 画面用データ */
export type AnalysisView = {
  members: MemberSummary[];
  /** 人×月の列。対象範囲で枠が存在する月のみ（YYYY-MM 昇順） */
  months: string[];
  /** 対象メンバーの1人あたり平均勤務日数 */
  averageDays: number;
  /** 勤務日数合計 ÷ 勤務可能日数合計。可能日数が 0 なら null */
  workRatio: number | null;
  totals: PhaseDays;
  fill: { past: FillRate; future: FillRate };
  weeks: WeeklyStaffing[];
};

function emptyDepartmentDays(): Record<DepartmentCode, number> {
  return { ski: 0, snowboard: 0 };
}

/** 数値配列の中央値。空なら 0 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1] ?? 0;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

/** 下書き枠を含めるかの判定 */
function isVisible(status: 'DRAFT' | 'PUBLISHED', includeDrafts: boolean): boolean {
  return includeDrafts || status === 'PUBLISHED';
}

/** 個人の負荷・勤務可能日数・月別の集計対象となる部門か */
function isInCountScope(departmentCode: DepartmentCode, filters: AnalysisFilters): boolean {
  return (
    filters.countScope === 'allDepartments' ||
    filters.department === 'all' ||
    filters.department === departmentCode
  );
}

/** 部門フィルタ（枠の充足・対象メンバー選定）に合致する部門か */
function matchesDepartmentFilter(
  departmentCode: DepartmentCode,
  filter: DepartmentFilter,
): boolean {
  return filter === 'all' || filter === departmentCode;
}

/**
 * 対象メンバーのID集合を求める。
 * 部門の対象メンバー＝その部門の有効な資格を持つ ACTIVE のインストラクター ∪ 当シーズンにその部門へ
 * 1回でも配置された人（status 不問）。全体は両部門の和集合。
 */
export function selectMemberIds(data: SeasonAnalysis, filters: AnalysisFilters): Set<string> {
  const ids = new Set<string>();
  for (const instructor of data.instructors) {
    if (
      instructor.status === 'ACTIVE' &&
      instructor.qualifiedDepartments.some((code) =>
        matchesDepartmentFilter(code, filters.department),
      )
    ) {
      ids.add(instructor.id);
    }
  }
  for (const assignment of data.assignments) {
    if (
      isVisible(assignment.shiftStatus, filters.includeDrafts) &&
      matchesDepartmentFilter(assignment.departmentCode, filters.department)
    ) {
      ids.add(assignment.instructorId);
    }
  }
  return ids;
}

/** 勤務日（日付→部門集合）を人別に集める。集計範囲外の部門は含めない */
function collectWorkDates(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
  memberIds: Set<string>,
): Map<string, Map<string, Set<DepartmentCode>>> {
  const byInstructor = new Map<string, Map<string, Set<DepartmentCode>>>();
  for (const assignment of data.assignments) {
    if (
      !memberIds.has(assignment.instructorId) ||
      !isVisible(assignment.shiftStatus, filters.includeDrafts) ||
      !isInCountScope(assignment.departmentCode, filters)
    ) {
      continue;
    }
    const dates =
      byInstructor.get(assignment.instructorId) ?? new Map<string, Set<DepartmentCode>>();
    const departments = dates.get(assignment.date) ?? new Set<DepartmentCode>();
    departments.add(assignment.departmentCode);
    dates.set(assignment.date, departments);
    byInstructor.set(assignment.instructorId, dates);
  }
  return byInstructor;
}

/** 集計範囲で枠が存在する日付の集合を部門別に集める */
function collectShiftDatesByDepartment(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
): Map<DepartmentCode, Set<string>> {
  const byDepartment = new Map<DepartmentCode, Set<string>>();
  for (const shift of data.shifts) {
    if (
      isVisible(shift.status, filters.includeDrafts) &&
      isInCountScope(shift.departmentCode, filters)
    ) {
      const dates = byDepartment.get(shift.departmentCode) ?? new Set<string>();
      dates.add(shift.date);
      byDepartment.set(shift.departmentCode, dates);
    }
  }
  return byDepartment;
}

/**
 * メンバーが勤務しうる枠の日付集合。関わりのない部門の枠日まで勤務可能と数えないよう、
 * 資格のある部門と実際に配置された部門の枠日だけを対象にする。
 */
function memberShiftDates(
  shiftDatesByDepartment: ReadonlyMap<DepartmentCode, ReadonlySet<string>>,
  qualifiedDepartments: readonly DepartmentCode[],
  workDates: ReadonlyMap<string, ReadonlySet<DepartmentCode>>,
): Set<string> {
  const departments = new Set(qualifiedDepartments);
  for (const workedDepartments of workDates.values()) {
    for (const department of workedDepartments) departments.add(department);
  }
  const dates = new Set<string>();
  for (const department of departments) {
    for (const date of shiftDatesByDepartment.get(department) ?? []) dates.add(date);
  }
  return dates;
}

/**
 * 勤務可能日数を数える。opt-out 設計のため、枠のある日のうち UNAVAILABLE 申告のない日が勤務可能。
 * AVOID は勤務可能に含め、件数だけ別に返す。
 */
export function countAvailability(
  shiftDates: ReadonlySet<string>,
  exceptions: SeasonAnalysis['availabilityExceptions'],
  instructorId: string,
): { availableDays: number; avoidDays: number } {
  let unavailable = 0;
  let avoid = 0;
  for (const exception of exceptions) {
    if (exception.instructorId !== instructorId || !shiftDates.has(exception.date)) continue;
    if (exception.type === 'UNAVAILABLE') unavailable += 1;
    else avoid += 1;
  }
  return { availableDays: shiftDates.size - unavailable, avoidDays: avoid };
}

function phaseOf(date: string, today: string): keyof PhaseDays {
  return date < today ? 'past' : 'future';
}

/** 充足率を求める */
function toFillRate(required: number, assigned: number): FillRate {
  return { required, assigned, rate: required === 0 ? null : (assigned / required) * 100 };
}

/** 日付を含む週の月曜日 */
function weekStartOf(date: string): string {
  return addDays(date, -((weekdayIndex(date) + 6) % 7));
}

/**
 * 週ごとの必要人数・配置人数・不足枠数を求める（requiredCount のある枠のみ）。
 * @param data - API 応答
 * @param filters - フィルタ（部門・下書きを反映）
 */
export function buildWeeklyStaffing(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
): WeeklyStaffing[] {
  const byWeek = new Map<string, { required: number; assigned: number; shortageSlots: number }>();
  for (const shift of data.shifts) {
    if (
      shift.requiredCount === null ||
      !isVisible(shift.status, filters.includeDrafts) ||
      !matchesDepartmentFilter(shift.departmentCode, filters.department)
    ) {
      continue;
    }
    const key = weekStartOf(shift.date);
    const week = byWeek.get(key) ?? { required: 0, assigned: 0, shortageSlots: 0 };
    week.required += shift.requiredCount;
    week.assigned += shift.assignedCount;
    if (shift.assignedCount < shift.requiredCount) week.shortageSlots += 1;
    byWeek.set(key, week);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, week]) => ({
      weekStart,
      phase:
        addDays(weekStart, 6) < data.today
          ? 'past'
          : weekStart >= data.today
            ? 'future'
            : 'current',
      ...week,
    }));
}

/** 枠の充足率（実施済み・予定別）。requiredCount が null の枠は除外 */
export function buildFill(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
): { past: FillRate; future: FillRate } {
  const sums = { past: { required: 0, assigned: 0 }, future: { required: 0, assigned: 0 } };
  for (const shift of data.shifts) {
    if (
      shift.requiredCount === null ||
      !isVisible(shift.status, filters.includeDrafts) ||
      !matchesDepartmentFilter(shift.departmentCode, filters.department)
    ) {
      continue;
    }
    const sum = sums[phaseOf(shift.date, data.today)];
    sum.required += shift.requiredCount;
    sum.assigned += shift.assignedCount;
  }
  return {
    past: toFillRate(sums.past.required, sums.past.assigned),
    future: toFillRate(sums.future.required, sums.future.assigned),
  };
}

/**
 * 画面用データを組み立てる。勤務日数の多い順に並んだメンバー一覧、月列、KPI 用の値、週別充足を返す。
 * @param data - API 応答（集計前の事実データ）
 * @param filters - 部門・下書き・負荷の数え方
 */
export function buildAnalysisView(data: SeasonAnalysis, filters: AnalysisFilters): AnalysisView {
  const memberIds = selectMemberIds(data, filters);
  const workDates = collectWorkDates(data, filters, memberIds);
  const shiftDatesByDepartment = collectShiftDatesByDepartment(data, filters);
  const months = [
    ...new Set(
      [...shiftDatesByDepartment.values()].flatMap((dates) =>
        [...dates].map((date) => date.slice(0, 7)),
      ),
    ),
  ].sort();
  const nameById = new Map(data.instructors.map((i) => [i.id, i.displayName]));
  const qualifiedById = new Map(data.instructors.map((i) => [i.id, i.qualifiedDepartments]));

  const members: MemberSummary[] = [...memberIds].map((id) => {
    const dates = workDates.get(id) ?? new Map<string, Set<DepartmentCode>>();
    const phase: PhaseDays = { past: 0, future: 0 };
    const departmentDays = emptyDepartmentDays();
    const monthPhase = new Map<string, PhaseDays>();
    const monthDepartments = new Map<string, Record<DepartmentCode, number>>();
    for (const [date, departments] of dates) {
      const kind = phaseOf(date, data.today);
      phase[kind] += 1;
      const month = date.slice(0, 7);
      const monthTotals = monthPhase.get(month) ?? { past: 0, future: 0 };
      monthTotals[kind] += 1;
      monthPhase.set(month, monthTotals);
      const monthDepartmentTotals = monthDepartments.get(month) ?? emptyDepartmentDays();
      for (const department of departments) {
        departmentDays[department] += 1;
        monthDepartmentTotals[department] += 1;
      }
      monthDepartments.set(month, monthDepartmentTotals);
    }
    const { availableDays, avoidDays } = countAvailability(
      memberShiftDates(shiftDatesByDepartment, qualifiedById.get(id) ?? [], dates),
      data.availabilityExceptions,
      id,
    );
    return {
      id,
      name: nameById.get(id) ?? id,
      ...phase,
      total: phase.past + phase.future,
      departmentDays,
      availableDays,
      avoidDays,
      // diff は月ごとの中央値が必要なため、後段で埋める
      months: months.map((month) => {
        const totals = monthPhase.get(month) ?? { past: 0, future: 0 };
        return {
          month,
          ...totals,
          total: totals.past + totals.future,
          diff: 0,
          topDepartment: topDepartmentOf(monthDepartments.get(month)),
        };
      }),
    };
  });

  // 月ごとの中央値は対象メンバー全員（0日の人を含む）で求める
  const medianByMonth = new Map(
    months.map((month, index) => [
      month,
      median(members.map((member) => member.months[index]?.total ?? 0)),
    ]),
  );
  for (const member of members) {
    for (const cell of member.months) {
      cell.diff = cell.total - (medianByMonth.get(cell.month) ?? 0);
    }
  }

  members.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));

  const totals: PhaseDays = {
    past: members.reduce((sum, m) => sum + m.past, 0),
    future: members.reduce((sum, m) => sum + m.future, 0),
  };
  const availableTotal = members.reduce((sum, m) => sum + m.availableDays, 0);
  return {
    members,
    months,
    averageDays: members.length === 0 ? 0 : (totals.past + totals.future) / members.length,
    workRatio: availableTotal === 0 ? null : (totals.past + totals.future) / availableTotal,
    totals,
    fill: buildFill(data, filters),
    weeks: buildWeeklyStaffing(data, filters),
  };
}

/** 部門別日数のうち最大の部門。すべて 0 なら null */
function topDepartmentOf(days: Record<DepartmentCode, number> | undefined): DepartmentCode | null {
  if (!days) return null;
  let top: DepartmentCode | null = null;
  let max = 0;
  for (const code of departmentCodeSchema.options) {
    if (days[code] > max) {
      top = code;
      max = days[code];
    }
  }
  return top;
}
