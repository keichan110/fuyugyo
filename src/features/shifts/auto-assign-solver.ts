import { scoreQualificationComposition } from './qualification-composition';
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
  // 必要資格が未設定の枠は、資格を満たすことを判定できないため提案しない。
  if (!frame || frame.certificationTiers.length === 0) {
    return { proposals: [] };
  }

  const eligibleIds = new Set(frame.eligibleInstructorIds);
  const qualifiedIds = new Set(
    context.instructors
      .filter(
        (instructor) =>
          eligibleIds.has(instructor.id) &&
          instructor.certificationIds.some((id) =>
            frame.certificationTiers.some((tier) => tier.certificationId === id),
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
  const tierRanks = effectiveTierRankByInstructor(context, frame.certificationTiers);
  const configuredTierCount = new Set(frame.certificationTiers.map((tier) => tier.tierRank)).size;
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
      tierRanks,
      configuredTierCount,
      random: createRandom(seed + restart),
    });
    if (!best || compareCost(candidate.cost, best.cost) < 0) {
      best = candidate;
    }
  }

  return { proposals: best?.proposals ?? [] };
}

type CandidateSolution = { proposals: AutoAssignProposal[]; cost: SolutionCost };
type SolutionCost = {
  shortage: number;
  avoid: number;
  qualificationSafety: number;
  fairness: number;
  qualificationDiversity: number;
};
type SolutionInput = {
  params: AutoAssignExecutionParams;
  targetDates: string[];
  qualifiedIds: Set<string>;
  unavailable: Set<string>;
  avoid: Set<string>;
  occupied: Set<string>;
  capacity: Map<string, number>;
  initialCounts: Map<string, number>;
  tierRanks: Map<string, number>;
  configuredTierCount: number;
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
      const instructorId = chooseCandidate({
        candidates,
        date,
        counts,
        capacity: input.capacity,
        avoid: input.avoid,
        selected,
        tierRanks: input.tierRanks,
        configuredTierCount: input.configuredTierCount,
        random: input.random,
      });
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
  const qualificationComposition = qualificationCompositionCost(
    proposals,
    input.tierRanks,
    input.configuredTierCount,
  );
  return {
    proposals,
    // 充足と AVOID を優先し、資格構成の安全性、公平性、レベルの多様性の順に評価する。
    cost: {
      shortage,
      avoid: avoidCount,
      qualificationSafety: qualificationComposition.safetyRisk,
      fairness: fairnessCost(counts, input.capacity),
      qualificationDiversity: qualificationComposition.diversityDeficit,
    },
  };
}

type CandidateSelectionInput = {
  candidates: string[];
  date: string;
  counts: Map<string, number>;
  capacity: Map<string, number>;
  avoid: Set<string>;
  selected: string[];
  tierRanks: Map<string, number>;
  configuredTierCount: number;
  random: () => number;
};

function chooseCandidate(input: CandidateSelectionInput): string | undefined {
  const { candidates, date, counts, capacity, avoid, selected, tierRanks, configuredTierCount } =
    input;
  const scored = candidates.map((id) => {
    const composition = scoreQualificationComposition(
      [...selected, id].map((instructorId) => tierRanks.get(instructorId) ?? 1),
      configuredTierCount,
    );
    return {
      id,
      // 乱数は同点を解消するだけで、AVOID・資格構成・公平性を覆さない。
      avoid: avoid.has(dateInstructorKey(date, id)) ? 1 : 0,
      qualificationSafety: composition.safetyRisk,
      fairness: incrementalFairnessCost(id, counts, capacity),
      qualificationDiversity: composition.diversityDeficit,
      tieBreaker: input.random(),
    };
  });
  scored.sort(
    (left, right) =>
      left.avoid - right.avoid ||
      left.qualificationSafety - right.qualificationSafety ||
      left.fairness - right.fairness ||
      left.qualificationDiversity - right.qualificationDiversity ||
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

function qualificationCompositionCost(
  proposals: AutoAssignProposal[],
  tierRanks: Map<string, number>,
  configuredTierCount: number,
): { safetyRisk: number; diversityDeficit: number } {
  return proposals.reduce(
    (total, proposal) => {
      const score = scoreQualificationComposition(
        proposal.instructorIds.map((id) => tierRanks.get(id) ?? 1),
        configuredTierCount,
      );
      return {
        safetyRisk: total.safetyRisk + score.safetyRisk,
        diversityDeficit: total.diversityDeficit + score.diversityDeficit,
      };
    },
    { safetyRisk: 0, diversityDeficit: 0 },
  );
}

function effectiveTierRankByInstructor(
  context: AutoAssignContext,
  certificationTiers: { certificationId: string; tierRank: number }[],
): Map<string, number> {
  const tierRankByCertification = new Map(
    certificationTiers.map((item) => [item.certificationId, item.tierRank]),
  );
  return new Map(
    context.instructors.map((instructor) => [
      instructor.id,
      Math.min(
        ...instructor.certificationIds
          .map((id) => tierRankByCertification.get(id))
          .filter((tierRank): tierRank is number => tierRank !== undefined),
      ),
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
    left.qualificationSafety - right.qualificationSafety ||
    left.fairness - right.fairness ||
    left.qualificationDiversity - right.qualificationDiversity
  );
}
