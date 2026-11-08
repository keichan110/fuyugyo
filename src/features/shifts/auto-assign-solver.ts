import { lowestRankOnlyReason, scoreQualificationComposition } from './qualification-composition';
import type { AutoAssignContext, AutoAssignExecutionParams, AutoAssignProposal } from './schema';

/** 自動割当の実行結果。対象枠の提案、不足人数、要確認の理由を含む。 */
export type AutoAssignSolveResult = { proposals: AutoAssignProposal[] };

type Cost = [
  avoidCount: number,
  consecutiveExcess: number,
  fairness: number,
  rankRisk: number,
  rankDeficit: number,
];
type Frame = {
  date: string;
  day: number;
  required: number;
  candidates: Set<string>;
  selected: string[];
};
type Evaluation = {
  baseline: Map<string, Set<number>>;
  avoid: Set<string>;
  rankById: Map<string, number>;
  configuredRankCount: number;
};

const MAX_RESTARTS = 20;
const MAX_IMPROVEMENT_EVALUATIONS = 20_000;

/**
 * 勤務可能、4連勤回避、部門内シーズン勤務日数、資格構成の順で割当案を生成する。
 * 勤務不可・必要資格なし・全部門の同日重複は候補から除外する。
 * 同一シードで再現でき、探索は回数上限を持つため最適解の保証はしない。
 */
export function solveAutoAssignments(
  context: AutoAssignContext,
  params: AutoAssignExecutionParams,
  seed: number,
): AutoAssignSolveResult {
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
  context = {
    ...context,
    existingAssignments: context.existingAssignments.filter(
      (assignment) =>
        assignment.departmentCode !== context.departmentCode ||
        assignment.shiftTypeId !== params.shiftTypeId ||
        !targets.has(assignment.date),
    ),
  };
  const configuration = context.frames.find((frame) => frame.shiftTypeId === params.shiftTypeId);
  if (!configuration || configuration.certificationTiers.length === 0) return { proposals: [] };
  const eligible = new Set(configuration.eligibleInstructorIds);
  const ranks = new Map(
    configuration.certificationTiers.map((tier) => [tier.certificationId, tier.tierRank]),
  );
  const qualified = context.instructors.filter(
    (instructor) =>
      eligible.has(instructor.id) && instructor.certificationIds.some((id) => ranks.has(id)),
  );
  // 複数資格の人は枠に紐づく資格のうち最上位のランクで評価する。
  const rankById = new Map(
    qualified.map((instructor) => [
      instructor.id,
      Math.min(...instructor.certificationIds.map((id) => ranks.get(id) ?? Infinity)),
    ]),
  );
  const configuredRankCount = new Set(ranks.values()).size;
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
  const occupied = new Set(
    context.existingAssignments.flatMap((assignment) =>
      assignment.instructorIds.map((id) => dateInstructorKey(assignment.date, id)),
    ),
  );
  const baseline = new Map(qualified.map((instructor) => [instructor.id, new Set<number>()]));
  for (const assignment of context.existingAssignments) {
    if (assignment.departmentCode !== context.departmentCode) continue;
    for (const id of assignment.instructorIds) baseline.get(id)?.add(dayNumber(assignment.date));
  }
  const evaluation: Evaluation = { baseline, avoid, rankById, configuredRankCount };
  const frames: Frame[] = [...targets].sort().map((date) => ({
    date,
    day: dayNumber(date),
    required: requiredCount(date, params),
    candidates: new Set(
      qualified
        .map((instructor) => instructor.id)
        .filter(
          (id) =>
            !unavailable.has(dateInstructorKey(date, id)) &&
            !occupied.has(dateInstructorKey(date, id)),
        ),
    ),
    selected: [],
  }));
  let best = frames;
  let bestCost: Cost | undefined;
  for (let restart = 0; restart < MAX_RESTARTS; restart += 1) {
    const random = createRandom(seed + restart);
    const candidate = frames.map((frame): Frame => ({ ...frame, selected: [] }));
    for (const frame of candidate) {
      while (
        frame.selected.length < frame.required &&
        frame.selected.length < frame.candidates.size
      ) {
        let chosen: string | undefined;
        let chosenCost: Cost | undefined;
        for (const id of shuffled([...frame.candidates], random)) {
          if (frame.selected.includes(id)) continue;
          frame.selected.push(id);
          const cost = evaluate(candidate, evaluation);
          frame.selected.pop();
          if (!chosenCost || compareCost(cost, chosenCost) < 0) {
            chosen = id;
            chosenCost = cost;
          }
        }
        if (chosen === undefined) break;
        frame.selected.push(chosen);
      }
    }
    const cost = evaluate(candidate, evaluation);
    if (!bestCost || compareCost(cost, bestCost) < 0) {
      best = candidate;
      bestCost = cost;
    }
  }
  improve(best, evaluation);
  const names = new Map(
    context.instructors.map((instructor) => [instructor.id, instructor.displayName]),
  );
  return {
    proposals: best.map((frame) => {
      const reasons: string[] = [];
      const unavailableCount = qualified.filter((instructor) =>
        unavailable.has(dateInstructorKey(frame.date, instructor.id)),
      ).length;
      const occupiedCount = qualified.filter((instructor) =>
        occupied.has(dateInstructorKey(frame.date, instructor.id)),
      ).length;
      if (frame.selected.length < frame.required) {
        if (unavailableCount) reasons.push(`UNAVAILABLE: ${unavailableCount}名`);
        if (occupiedCount) reasons.push(`同日割当済み: ${occupiedCount}名`);
        if (!reasons.length) reasons.push('資格を満たす候補者が不足');
      }
      const reviewReasons: string[] = [];
      // 枠の最下位ランクだけで組んだ構成は、画面表示と同じ判定で要確認にする。
      const compositionReason = lowestRankOnlyReason(
        frame.selected.map((id) => rankById.get(id) ?? Infinity),
        configuration.certificationTiers,
      );
      if (compositionReason) reviewReasons.push(compositionReason);
      const avoidNames = frame.selected
        .filter((id) => avoid.has(dateInstructorKey(frame.date, id)))
        .map((id) => names.get(id) ?? id);
      if (avoidNames.length) reviewReasons.push(`要調整の勤務: ${avoidNames.join('、')}`);
      return {
        date: frame.date,
        shiftTypeId: params.shiftTypeId,
        instructorIds: frame.selected,
        shortage: { count: frame.required - frame.selected.length, reasons },
        reviewReasons,
      };
    }),
  };
}

// 全体を同じ尺度で評価し、前後の保存済み勤務と提案中の勤務をつなげて連勤を数える。
function evaluate(frames: Frame[], input: Evaluation): Cost {
  const dates = new Map([...input.baseline].map(([id, days]) => [id, new Set(days)]));
  let avoid = 0;
  let rankRisk = 0;
  let rankDeficit = 0;
  for (const frame of frames) {
    for (const id of frame.selected) {
      dates.get(id)?.add(frame.day);
      if (input.avoid.has(dateInstructorKey(frame.date, id))) avoid += 1;
    }
    const composition = scoreQualificationComposition(
      frame.selected.map((id) => input.rankById.get(id) ?? Infinity),
      input.configuredRankCount,
    );
    rankRisk += composition.safetyRisk;
    rankDeficit += composition.diversityDeficit;
  }
  let consecutiveExcess = 0;
  let fairness = 0;
  for (const days of dates.values()) {
    let previous: number | undefined;
    let run = 0;
    for (const day of [...days].sort((left, right) => left - right)) {
      run = previous !== undefined && day - previous === 1 ? run + 1 : 1;
      if (run >= 4) consecutiveExcess += 1;
      previous = day;
    }
    fairness += days.size ** 2;
  }
  return [avoid, consecutiveExcess, fairness, rankRisk, rankDeficit];
}

// 1枠内の置換に加えて日付間の交換も行い、貪欲法だけでは解けない偏りを改善する。
function improve(frames: Frame[], input: Evaluation): void {
  let cost = evaluate(frames, input);
  let evaluations = 0;
  let changed = true;
  while (changed && evaluations < MAX_IMPROVEMENT_EVALUATIONS) {
    changed = false;
    for (const frame of frames) {
      for (let index = 0; index < frame.selected.length; index += 1) {
        const original = frame.selected[index];
        if (original === undefined) continue;
        for (const id of frame.candidates) {
          if (frame.selected.includes(id)) continue;
          frame.selected[index] = id;
          const next = evaluate(frames, input);
          evaluations += 1;
          if (compareCost(next, cost) < 0) {
            cost = next;
            changed = true;
            break;
          }
          frame.selected[index] = original;
          if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
        }
        if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
      }
    }
    for (let leftIndex = 0; leftIndex < frames.length; leftIndex += 1) {
      const left = frames[leftIndex];
      if (!left) continue;
      for (const right of frames.slice(leftIndex + 1)) {
        const leftSelected = new Set(left.selected);
        const rightSelected = new Set(right.selected);
        for (let a = 0; a < left.selected.length; a += 1) {
          for (let b = 0; b < right.selected.length; b += 1) {
            const leftId = left.selected[a];
            const rightId = right.selected[b];
            if (
              !leftId ||
              !rightId ||
              leftSelected.has(rightId) ||
              rightSelected.has(leftId) ||
              !left.candidates.has(rightId) ||
              !right.candidates.has(leftId)
            )
              continue;
            left.selected[a] = rightId;
            right.selected[b] = leftId;
            const next = evaluate(frames, input);
            evaluations += 1;
            if (compareCost(next, cost) < 0) {
              cost = next;
              changed = true;
              leftSelected.delete(leftId);
              leftSelected.add(rightId);
              rightSelected.delete(rightId);
              rightSelected.add(leftId);
            } else {
              left.selected[a] = leftId;
              right.selected[b] = rightId;
            }
            if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
          }
        }
      }
    }
  }
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function dateInstructorKey(date: string, instructorId: string): string {
  return `${date}:${instructorId}`;
}

function compareCost(left: Cost, right: Cost): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function requiredCount(date: string, params: AutoAssignExecutionParams): number {
  return params.requiredCountByDate[date] ?? 0;
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
