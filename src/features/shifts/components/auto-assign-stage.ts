import type { AutoAssignProposal } from '../schema';

/** 自動割当案を月次ステージへ一括反映するセル値。 */
export type AutoAssignStagedCell = {
  instructorIds: string[];
  description: string;
};

/**
 * 自動割当の提案をステージ済みセルへ適用する。
 * 対象セルの既存内容は白紙から置換し、対象外セルの編集は保持する。
 */
export function applyAutoAssignProposals({
  stagedCells,
  proposals,
}: {
  stagedCells: Map<string, AutoAssignStagedCell>;
  proposals: AutoAssignProposal[];
}): Map<string, AutoAssignStagedCell> {
  const next = new Map(stagedCells);
  for (const proposal of proposals) {
    next.set(`${proposal.date}:${proposal.shiftTypeId}`, {
      instructorIds: proposal.instructorIds,
      description: '',
    });
  }
  return next;
}
