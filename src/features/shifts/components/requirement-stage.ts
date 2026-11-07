import type { AutoAssignProposal } from '../schema';
import { resolveInitialRequiredCount, type InitialRequiredCounts } from '../staffing';
import { cellKey } from './shift-manager-utils';

/**
 * 未保存の必要人数。source は値の由来で、manual は利用者が明示した値、
 * default は自動割当が初期値から補った値（再実行で再計算される）。
 */
export type StagedRequirement = {
  requiredCount: number | null;
  source: 'default' | 'manual';
};

/** cellKey（日付:シフト種別ID）→ 未保存の必要人数 */
export type StagedRequirements = Map<string, StagedRequirement>;

/** cellKey → 保存済みの必要人数（行なしは含めない） */
export type SavedRequirements = ReadonlyMap<string, number>;

/**
 * 手動で必要人数をステージする。保存済みの値と同じならステージから除く。
 * null は未設定（保存済みの行があれば削除）を表す。
 */
export function stageManualRequirement(
  staged: StagedRequirements,
  saved: SavedRequirements,
  key: string,
  requiredCount: number | null,
): StagedRequirements {
  const next = new Map(staged);
  if (requiredCount === (saved.get(key) ?? null)) {
    next.delete(key);
  } else {
    next.set(key, { requiredCount, source: 'manual' });
  }
  return next;
}

/** 表示用の実効値。ステージ値（manual/default 問わず）を保存値より優先する。 */
export function effectiveRequiredCount(
  staged: StagedRequirements,
  saved: SavedRequirements,
  key: string,
): number | null {
  const stagedValue = staged.get(key);
  return stagedValue ? stagedValue.requiredCount : (saved.get(key) ?? null);
}

/** 自動割当が確定値として扱う必要人数。manual のステージ値を保存値より優先し、default は含めない。 */
export function fixedRequiredCount(
  staged: StagedRequirements,
  saved: SavedRequirements,
  key: string,
): number | null {
  const stagedValue = staged.get(key);
  return stagedValue?.source === 'manual' ? stagedValue.requiredCount : (saved.get(key) ?? null);
}

/** 自動割当の対象日の解決結果。 */
export type AutoAssignRequirementPlan = {
  /** ソルバーへ渡す日（解決後の人数が1名以上） */
  solverDates: string[];
  /** 解決後の人数（0名で除外した日も含む。確定値が0名の日は含めない） */
  resolvedByDate: Map<string, number>;
  requiredCountByDate: Record<string, number>;
};

/**
 * 自動割当の人数を日別に解決する。確定値（fixed）があればそれを、なければ
 * モーダルの初期値を使う。確定値が0名の日と解決後0名の日はソルバーへ渡さない。
 */
export function planAutoAssignRequirements({
  dates,
  shiftTypeId,
  staged,
  saved,
  initialCounts,
}: {
  dates: Iterable<string>;
  shiftTypeId: string;
  staged: StagedRequirements;
  saved: SavedRequirements;
  initialCounts: InitialRequiredCounts;
}): AutoAssignRequirementPlan {
  const solverDates: string[] = [];
  const resolvedByDate = new Map<string, number>();
  const requiredCountByDate: Record<string, number> = {};
  for (const date of dates) {
    const fixed = fixedRequiredCount(staged, saved, cellKey(date, shiftTypeId));
    if (fixed === 0) continue;
    const required = fixed ?? resolveInitialRequiredCount(date, initialCounts);
    resolvedByDate.set(date, required);
    if (required === 0) continue;
    solverDates.push(date);
    requiredCountByDate[date] = required;
  }
  return { solverDates, resolvedByDate, requiredCountByDate };
}

/**
 * 自動割当の成功後に、確定値がない日の必要人数を default としてステージする。
 * 提案が空のときは何もステージしない。
 */
export function applyAutoAssignRequirements({
  staged,
  saved,
  shiftTypeId,
  proposals,
  plan,
}: {
  staged: StagedRequirements;
  saved: SavedRequirements;
  shiftTypeId: string;
  proposals: AutoAssignProposal[];
  plan: AutoAssignRequirementPlan;
}): StagedRequirements {
  if (proposals.length === 0) return staged;
  const proposedDates = new Set(proposals.map((proposal) => proposal.date));
  const next = new Map(staged);
  for (const [date, required] of plan.resolvedByDate) {
    // 提案に含まれる日、または解決後0名で除外された日のうち、確定値がない日だけが対象
    const excludedByZero = !proposedDates.has(date) && required === 0;
    if (!(proposedDates.has(date) || excludedByZero)) continue;
    const key = cellKey(date, shiftTypeId);
    if (fixedRequiredCount(staged, saved, key) !== null) continue;
    next.set(key, { requiredCount: required, source: 'default' });
  }
  return next;
}

/** 一括設定の対象日（表示用の実効値が未設定、または default 由来の日）。 */
export function bulkRequirementTargetDates({
  dates,
  shiftTypeId,
  staged,
  saved,
}: {
  dates: readonly string[];
  shiftTypeId: string;
  staged: StagedRequirements;
  saved: SavedRequirements;
}): string[] {
  return dates.filter((date) => {
    const key = cellKey(date, shiftTypeId);
    return (
      effectiveRequiredCount(staged, saved, key) === null || staged.get(key)?.source === 'default'
    );
  });
}

/** 一括設定を適用し、対象日へ manual で平日／土日祝の人数をステージする。設定済みの日は変えない。 */
export function applyBulkRequirements({
  dates,
  shiftTypeId,
  staged,
  saved,
  counts,
}: {
  dates: readonly string[];
  shiftTypeId: string;
  staged: StagedRequirements;
  saved: SavedRequirements;
  counts: InitialRequiredCounts;
}): StagedRequirements {
  let next = staged;
  for (const date of bulkRequirementTargetDates({ dates, shiftTypeId, staged, saved })) {
    next = stageManualRequirement(
      next,
      saved,
      cellKey(date, shiftTypeId),
      resolveInitialRequiredCount(date, counts),
    );
  }
  return next;
}
