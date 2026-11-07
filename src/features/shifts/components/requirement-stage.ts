import { resolveInitialRequiredCount, type InitialRequiredCounts } from '../staffing';
import { cellKey } from './shift-manager-utils';

/** 未保存の必要人数。null は未設定（保存済みの行があれば削除）を表す。 */
export type StagedRequirement = {
  requiredCount: number | null;
};

/** cellKey（日付:シフト種別ID）→ 未保存の必要人数 */
export type StagedRequirements = Map<string, StagedRequirement>;

/** cellKey → 保存済みの必要人数（行なしは含めない） */
export type SavedRequirements = ReadonlyMap<string, number>;

/**
 * 必要人数をステージする。保存済みの値と同じならステージから除く。
 * null は未設定（保存済みの行があれば削除）を表す。
 */
export function stageRequirement(
  staged: StagedRequirements,
  saved: SavedRequirements,
  key: string,
  requiredCount: number | null,
): StagedRequirements {
  const next = new Map(staged);
  if (requiredCount === (saved.get(key) ?? null)) {
    next.delete(key);
  } else {
    next.set(key, { requiredCount });
  }
  return next;
}

/** 実効値。未保存の値を保存済みの値より優先する（未設定は null）。 */
export function effectiveRequiredCount(
  staged: StagedRequirements,
  saved: SavedRequirements,
  key: string,
): number | null {
  const stagedValue = staged.get(key);
  return stagedValue ? stagedValue.requiredCount : (saved.get(key) ?? null);
}

/** 自動割当の対象にできる日か（実効値が1名以上。未設定と0名は対象外）。 */
export function isAutoAssignSelectable(
  staged: StagedRequirements,
  saved: SavedRequirements,
  date: string,
  shiftTypeId: string,
): boolean {
  return (effectiveRequiredCount(staged, saved, cellKey(date, shiftTypeId)) ?? 0) >= 1;
}

/** 指定した日のうち、自動割当で選べる日（実効値が1名以上）の数。 */
export function countAutoAssignSelectableDates({
  dates,
  shiftTypeId,
  staged,
  saved,
}: {
  dates: readonly string[];
  shiftTypeId: string;
  staged: StagedRequirements;
  saved: SavedRequirements;
}): number {
  return dates.filter((date) => isAutoAssignSelectable(staged, saved, date, shiftTypeId)).length;
}

/** 自動割当の対象日と日別の必要人数。実効値が1名以上の日だけを含める。 */
export type AutoAssignTargets = {
  targetDates: string[];
  requiredCountByDate: Record<string, number>;
};

/** 選択された日のうち、実効値が1名以上の日だけを自動割当の対象にする。 */
export function planAutoAssignTargets({
  dates,
  shiftTypeId,
  staged,
  saved,
}: {
  dates: Iterable<string>;
  shiftTypeId: string;
  staged: StagedRequirements;
  saved: SavedRequirements;
}): AutoAssignTargets {
  const targetDates: string[] = [];
  const requiredCountByDate: Record<string, number> = {};
  for (const date of dates) {
    const required = effectiveRequiredCount(staged, saved, cellKey(date, shiftTypeId)) ?? 0;
    if (required < 1) continue;
    targetDates.push(date);
    requiredCountByDate[date] = required;
  }
  return { targetDates, requiredCountByDate };
}

/** 一括設定の対象日（実効値が未設定の日）。 */
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
  return dates.filter(
    (date) => effectiveRequiredCount(staged, saved, cellKey(date, shiftTypeId)) === null,
  );
}

/** 一括設定を適用し、対象日へ平日／土日祝の人数をステージする。設定済みの日は変えない。 */
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
    next = stageRequirement(
      next,
      saved,
      cellKey(date, shiftTypeId),
      resolveInitialRequiredCount(date, counts),
    );
  }
  return next;
}
