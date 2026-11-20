import type { CompositionTier } from '../qualification-composition';
import type { AutoAssignContext, AutoAssignExecutionParams } from '../schema';

/** 自動割当の対象1枠。候補は絶対条件（勤務不可・必要資格・同日重複）を通過した人だけを含む。 */
export type AssignmentFrame = {
  date: string;
  /** 連勤の判定に使う通日 */
  day: number;
  required: number;
  candidates: ReadonlySet<string>;
  selected: string[];
};

/** 案の集計に使う、割当案によって変わらない前提。 */
export type PlanBasis = {
  /** 対象枠を除いた当該部門の勤務日（通日）。必要資格を満たす人だけを持つ */
  baseline: ReadonlyMap<string, ReadonlySet<number>>;
  /** 要調整の申告。キーは {@link dateInstructorKey} */
  avoid: ReadonlySet<string>;
  /** 枠に紐づく資格のうち、その人の最上位ランク */
  rankById: ReadonlyMap<string, number>;
  configuredRankCount: number;
};

/** 絶対条件を適用し終えた自動割当の問題。 */
export type AssignmentProblem = {
  frames: AssignmentFrame[];
  basis: PlanBasis;
  qualifiedIds: string[];
  /** 勤務不可の申告。キーは {@link dateInstructorKey} */
  unavailable: ReadonlySet<string>;
  /** 全部門・全種別の同日勤務。キーは {@link dateInstructorKey} */
  occupied: ReadonlySet<string>;
  certificationTiers: CompositionTier[];
};

/**
 * 絶対条件を適用して、対象枠ごとの候補と集計の前提を組み立てる。
 * 勤務不可・必要資格なし・全部門の同日重複は候補から除外する。
 * 枠に必要資格が設定されていなければ null を返す。
 */
export function buildAssignmentProblem(
  context: AutoAssignContext,
  params: AutoAssignExecutionParams,
): AssignmentProblem | null {
  // 対象枠は白紙から置き換えるため、元の勤務を重複判定・勤務日数へ二重計上しない。
  const published = new Set(
    context.publishedSlots
      .filter(
        (slot) =>
          slot.departmentCode === context.departmentCode && slot.shiftTypeId === params.shiftTypeId,
      )
      .map((slot) => slot.date),
  );
  const targets = new Set(params.targetDates.filter((date) => !published.has(date)));
  const existingAssignments = context.existingAssignments.filter(
    (assignment) =>
      assignment.departmentCode !== context.departmentCode ||
      assignment.shiftTypeId !== params.shiftTypeId ||
      !targets.has(assignment.date),
  );
  const configuration = context.frames.find((frame) => frame.shiftTypeId === params.shiftTypeId);
  if (!configuration || configuration.certificationTiers.length === 0) return null;
  const eligible = new Set(configuration.eligibleInstructorIds);
  const ranks = new Map(
    configuration.certificationTiers.map((tier) => [tier.certificationId, tier.tierRank]),
  );
  const qualified = context.instructors.filter(
    (instructor) =>
      eligible.has(instructor.id) && instructor.certificationIds.some((id) => ranks.has(id)),
  );
  const qualifiedIds = qualified.map((instructor) => instructor.id);
  // 複数資格の人は枠に紐づく資格のうち最上位のランクで評価する。
  const rankById = new Map(
    qualified.map((instructor) => [
      instructor.id,
      Math.min(...instructor.certificationIds.map((id) => ranks.get(id) ?? Infinity)),
    ]),
  );
  const declared = (type: 'UNAVAILABLE' | 'AVOID') =>
    new Set(
      context.availabilities
        .filter((item) => item.type === type)
        .map((item) => dateInstructorKey(item.date, item.instructorId)),
    );
  const unavailable = declared('UNAVAILABLE');
  const occupied = new Set(
    existingAssignments.flatMap((assignment) =>
      assignment.instructorIds.map((id) => dateInstructorKey(assignment.date, id)),
    ),
  );
  const baseline = new Map(qualifiedIds.map((id) => [id, new Set<number>()]));
  for (const assignment of existingAssignments) {
    if (assignment.departmentCode !== context.departmentCode) continue;
    for (const id of assignment.instructorIds) baseline.get(id)?.add(dayNumber(assignment.date));
  }
  const frames = [...targets].sort().map((date): AssignmentFrame => ({
    date,
    day: dayNumber(date),
    required: params.requiredCountByDate[date] ?? 0,
    candidates: new Set(
      qualifiedIds.filter(
        (id) =>
          !unavailable.has(dateInstructorKey(date, id)) &&
          !occupied.has(dateInstructorKey(date, id)),
      ),
    ),
    selected: [],
  }));
  return {
    frames,
    basis: {
      baseline,
      avoid: declared('AVOID'),
      rankById,
      configuredRankCount: new Set(ranks.values()).size,
    },
    qualifiedIds,
    unavailable,
    occupied,
    certificationTiers: configuration.certificationTiers,
  };
}

/** 日付と Instructor の組を、申告や同日勤務の照合に使うキーへ変換する。 */
export function dateInstructorKey(date: string, instructorId: string): string {
  return `${date}:${instructorId}`;
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}
