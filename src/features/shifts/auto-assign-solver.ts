import { scorePlan, summarizePlan } from './auto-assign/criteria';
import { buildAssignmentProblem, dateInstructorKey } from './auto-assign/problem';
import { searchAssignments } from './auto-assign/search';
import { lowestRankOnlyReason } from './qualification-composition';
import type { AutoAssignContext, AutoAssignExecutionParams, AutoAssignProposal } from './schema';

/** 自動割当の実行結果。対象枠の提案、不足人数、要確認の理由を含む。 */
export type AutoAssignSolveResult = { proposals: AutoAssignProposal[] };

/**
 * 勤務可能、4連勤回避、部門内シーズン勤務日数、資格構成の順で割当案を生成する。
 * 勤務不可・必要資格なし・全部門の同日重複は候補から除外する。
 * 同一シードで再現でき、探索は回数上限を持つため最適解の保証はしない。
 *
 * 候補の絞り込みは `auto-assign/problem.ts`、案の集計と優先順位は `auto-assign/criteria.ts`、
 * 探索は `auto-assign/search.ts` が担う。優先順位を変えるときは criteria だけを直す。
 */
export function solveAutoAssignments(
  context: AutoAssignContext,
  params: AutoAssignExecutionParams,
  seed: number,
): AutoAssignSolveResult {
  const problem = buildAssignmentProblem(context, params);
  if (!problem) return { proposals: [] };
  const { basis, qualifiedIds, unavailable, occupied, certificationTiers } = problem;
  const best = searchAssignments(
    problem.frames,
    (frames) => scorePlan(summarizePlan(frames, basis)),
    seed,
  );
  const names = new Map(
    context.instructors.map((instructor) => [instructor.id, instructor.displayName]),
  );
  return {
    proposals: best.map((frame) => {
      const reasons: string[] = [];
      const unavailableCount = qualifiedIds.filter((id) =>
        unavailable.has(dateInstructorKey(frame.date, id)),
      ).length;
      const occupiedCount = qualifiedIds.filter((id) =>
        occupied.has(dateInstructorKey(frame.date, id)),
      ).length;
      if (frame.selected.length < frame.required) {
        if (unavailableCount) reasons.push(`UNAVAILABLE: ${unavailableCount}名`);
        if (occupiedCount) reasons.push(`同日割当済み: ${occupiedCount}名`);
        if (!reasons.length) reasons.push('資格を満たす候補者が不足');
      }
      const reviewReasons: string[] = [];
      // 枠の最下位ランクだけで組んだ構成は、画面表示と同じ判定で要確認にする。
      const compositionReason = lowestRankOnlyReason(
        frame.selected.map((id) => basis.rankById.get(id) ?? Infinity),
        certificationTiers,
      );
      if (compositionReason) reviewReasons.push(compositionReason);
      const avoidNames = frame.selected
        .filter((id) => basis.avoid.has(dateInstructorKey(frame.date, id)))
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
