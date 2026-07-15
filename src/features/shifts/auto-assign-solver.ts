import type { AutoAssignContext, AutoAssignExecutionParams, AutoAssignProposal } from './schema';

/** 自動割当の実行結果。提案は対象外の枠を含まない。 */
export type AutoAssignSolveResult = {
  proposals: AutoAssignProposal[];
};

const MAX_RESTARTS = 20;

/**
 * 集約コンテキストから、保存前の自動割当案を生成する。
 * UNAVAILABLE・資格・同日重複は候補抽出時に除外するため、探索中も破られない。
 * @param context - API が返す候補・可用性・既存割当
 * @param params - 対象日と必要人数
 * @param seed - 再現可能な乱択シード
 * @returns 枠ごとの提案と不足内訳
 */
export function solveAutoAssignments(
  context: AutoAssignContext,
  params: AutoAssignExecutionParams,
  seed: number,
): AutoAssignSolveResult {
  const frame = context.frames.find((item) => item.shiftTypeId === params.shiftTypeId);
  // 資格序列が未設定の枠は、資格を満たすことを判定できないため提案しない。
  if (!frame || frame.certificationLevels.length === 0) {
    return { proposals: [] };
  }

  const eligibleIds = new Set(frame.eligibleInstructorIds);
  const qualifiedIds = new Set(
    context.instructors
      .filter(
        (instructor) =>
          eligibleIds.has(instructor.id) &&
          instructor.certificationIds.some((id) =>
            frame.certificationLevels.some((level) => level.certificationId === id),
          ),
      )
      .map((instructor) => instructor.id),
  );
  const targetDates = [...new Set(params.targetDates)].sort();
  const unavailable = new Set(
    context.availabilities
      .filter((item) => item.type === 'UNAVAILABLE')
      .map((item) => dateInstructorKey(item.date, item.instructorId)),
  );
  const avoid = new Set(
    context.availabilities
      .filter((item) => item.type === 'AVOID')
      .map((item) => dateInstructorKey(item.date, item.instructorId)),
  );
  const occupied = occupiedDateInstructorKeys(context);
  const capacity = calculateCapacity(context, targetDates, unavailable);
  const normalizedLevels = normalizedLevelByInstructor(context, frame.certificationLevels);
  const initialCounts = countAssignedDays(context.existingAssignments);
  let best: CandidateSolution | undefined;

  for (let restart = 0; restart < MAX_RESTARTS; restart += 1) {
    const candidate = createSolution({
      params,
      targetDates,
      qualifiedIds,
      unavailable,
      avoid,
      occupied,
      capacity,
      initialCounts,
      normalizedLevels,
      random: createRandom(seed + restart),
    });
    if (!best || compareCost(candidate.cost, best.cost) < 0) {
      best = candidate;
    }
  }

  return { proposals: best?.proposals ?? [] };
}

type CandidateSolution = { proposals: AutoAssignProposal[]; cost: SolutionCost };
type SolutionCost = { shortage: number; avoid: number; fairness: number; qualification: number };
type SolutionInput = {
  params: AutoAssignExecutionParams;
  targetDates: string[];
  qualifiedIds: Set<string>;
  unavailable: Set<string>;
  avoid: Set<string>;
  occupied: Set<string>;
  capacity: Map<string, number>;
  initialCounts: Map<string, number>;
  normalizedLevels: Map<string, number>;
  random: () => number;
};

function createSolution(input: SolutionInput): CandidateSolution {
  const occupied = new Set(input.occupied);
  const counts = new Map(input.initialCounts);
  const proposals: AutoAssignProposal[] = [];
  let avoidCount = 0;

  for (const date of input.targetDates) {
    const required = requiredCount(date, input.params);
    const originallyOccupied = new Set(occupied);
    const candidates = shuffled([...input.qualifiedIds], input.random).filter(
      (instructorId) =>
        !input.unavailable.has(dateInstructorKey(date, instructorId)) &&
        !occupied.has(dateInstructorKey(date, instructorId)),
    );
    const selected: string[] = [];
    while (selected.length < required && candidates.length > 0) {
      const instructorId = chooseCandidate(
        candidates,
        date,
        counts,
        input.capacity,
        input.avoid,
        input.normalizedLevels,
        input.random,
      );
      if (!instructorId) break;
      candidates.splice(candidates.indexOf(instructorId), 1);
      selected.push(instructorId);
      occupied.add(dateInstructorKey(date, instructorId));
      counts.set(instructorId, (counts.get(instructorId) ?? 0) + 1);
      if (input.avoid.has(dateInstructorKey(date, instructorId))) avoidCount += 1;
    }
    proposals.push({
      date,
      shiftTypeId: input.params.shiftTypeId,
      instructorIds: selected,
      shortage: {
        count: required - selected.length,
        reasons:
          required > selected.length
            ? shortageReasons(date, input.qualifiedIds, input.unavailable, originallyOccupied)
            : [],
      },
    });
  }

  const shortage = proposals.reduce((sum, proposal) => sum + proposal.shortage.count, 0);
  return {
    proposals,
    // 充足を最優先し、次に AVOID、公平性、最後に資格構成を評価する。
    cost: {
      shortage,
      avoid: avoidCount,
      fairness: fairnessCost(counts, input.capacity),
      qualification: qualificationCost(proposals, input.normalizedLevels),
    },
  };
}

function chooseCandidate(
  candidates: string[],
  date: string,
  counts: Map<string, number>,
  capacity: Map<string, number>,
  avoid: Set<string>,
  normalizedLevels: Map<string, number>,
  random: () => number,
): string | undefined {
  const scored = candidates.map((id) => ({
    id,
    // AVOID は公平性より強く回避する。乱数は同点を解消するだけで制約・重みを覆さない。
    avoid: avoid.has(dateInstructorKey(date, id)) ? 1 : 0,
    fairness: incrementalFairnessCost(id, counts, capacity),
    qualification: (normalizedLevels.get(id) ?? 0) * 0.1,
    tieBreaker: random(),
  }));
  scored.sort(
    (left, right) =>
      left.avoid - right.avoid ||
      left.fairness - right.fairness ||
      left.qualification - right.qualification ||
      left.tieBreaker - right.tieBreaker,
  );
  return scored[0]?.id ?? candidates[0];
}

function shortageReasons(
  date: string,
  qualifiedIds: Set<string>,
  unavailable: Set<string>,
  occupied: Set<string>,
): string[] {
  const unavailableCount = [...qualifiedIds].filter((id) =>
    unavailable.has(dateInstructorKey(date, id)),
  ).length;
  const occupiedCount = [...qualifiedIds].filter((id) =>
    occupied.has(dateInstructorKey(date, id)),
  ).length;
  const reasons: string[] = [];
  if (unavailableCount > 0) reasons.push(`UNAVAILABLE: ${unavailableCount}名`);
  if (occupiedCount > 0) reasons.push(`同日割当済み: ${occupiedCount}名`);
  if (reasons.length === 0) reasons.push('資格を満たす候補者が不足');
  return reasons;
}

function calculateCapacity(
  context: AutoAssignContext,
  targetDates: string[],
  unavailable: Set<string>,
): Map<string, number> {
  return new Map(
    context.instructors.map((instructor) => [
      instructor.id,
      targetDates.filter((date) => !unavailable.has(dateInstructorKey(date, instructor.id))).length,
    ]),
  );
}

function countAssignedDays(
  assignments: AutoAssignContext['existingAssignments'],
): Map<string, number> {
  const datesByInstructor = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    for (const instructorId of assignment.instructorIds) {
      const dates = datesByInstructor.get(instructorId) ?? new Set<string>();
      dates.add(assignment.date);
      datesByInstructor.set(instructorId, dates);
    }
  }
  return new Map([...datesByInstructor].map(([id, dates]) => [id, dates.size]));
}

function occupiedDateInstructorKeys(context: AutoAssignContext): Set<string> {
  return new Set(
    context.existingAssignments.flatMap((assignment) =>
      assignment.instructorIds.map((instructorId) =>
        dateInstructorKey(assignment.date, instructorId),
      ),
    ),
  );
}

function incrementalFairnessCost(
  instructorId: string,
  counts: Map<string, number>,
  capacity: Map<string, number>,
): number {
  const totalAssignments = [...counts.values()].reduce((sum, count) => sum + count, 0) + 1;
  const totalCapacity = [...capacity.values()].reduce((sum, value) => sum + value, 0);
  if (totalCapacity === 0) return 0;
  const target = (totalAssignments * (capacity.get(instructorId) ?? 0)) / totalCapacity;
  return Math.pow((counts.get(instructorId) ?? 0) + 1 - target, 2);
}

function fairnessCost(counts: Map<string, number>, capacity: Map<string, number>): number {
  const totalAssignments = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const totalCapacity = [...capacity.values()].reduce((sum, value) => sum + value, 0);
  if (totalCapacity === 0) return 0;
  return [...capacity].reduce((sum, [id, value]) => {
    const target = (totalAssignments * value) / totalCapacity;
    return sum + Math.pow((counts.get(id) ?? 0) - target, 2);
  }, 0);
}

function qualificationCost(
  proposals: AutoAssignProposal[],
  normalizedLevels: Map<string, number>,
): number {
  return proposals.reduce((sum, proposal) => {
    const levels = proposal.instructorIds.map((id) => normalizedLevels.get(id) ?? 0);
    if (levels.length === 0) return sum;
    // 段数ではなく 0..n-1 に正規化した天井と散らばりを、低い優先度で評価する。
    return sum + (Math.max(...levels) * 2 + Math.max(...levels) - Math.min(...levels)) * 0.1;
  }, 0);
}

function normalizedLevelByInstructor(
  context: AutoAssignContext,
  certificationLevels: { certificationId: string; level: number }[],
): Map<string, number> {
  const levels = [...new Set(certificationLevels.map((item) => item.level))].sort(
    (left, right) => left - right,
  );
  const normalizedByCertification = new Map(
    certificationLevels.map((item) => [item.certificationId, levels.indexOf(item.level)]),
  );
  return new Map(
    context.instructors.map((instructor) => [
      instructor.id,
      Math.max(...instructor.certificationIds.map((id) => normalizedByCertification.get(id) ?? -1)),
    ]),
  );
}

function requiredCount(date: string, params: AutoAssignExecutionParams): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6 || params.holidayDates.includes(date)
    ? params.weekendHolidayRequiredCount
    : params.weekdayRequiredCount;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const replacement = Math.floor(random() * (index + 1));
    const current = items[index];
    const selected = items[replacement];
    if (current !== undefined && selected !== undefined) {
      [items[index], items[replacement]] = [selected, current];
    }
  }
  return items;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function dateInstructorKey(date: string, instructorId: string): string {
  return `${date}:${instructorId}`;
}

function compareCost(left: SolutionCost, right: SolutionCost): number {
  return (
    left.shortage - right.shortage ||
    left.avoid - right.avoid ||
    left.fairness - right.fairness ||
    left.qualification - right.qualification
  );
}
