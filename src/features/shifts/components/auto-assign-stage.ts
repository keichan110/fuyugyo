import type { AutoAssignContext, AutoAssignProposal } from '../schema';

/** 自動割当案を月次ステージへ一括反映するセル値。 */
export type AutoAssignStagedCell = {
  instructorIds: string[];
  description: string;
  expectedRevision?: number | null;
  expectedShiftId?: string | null;
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
      description: (proposal.reviewReasons ?? []).map((reason) => `要確認: ${reason}`).join('\n'),
    });
  }
  return next;
}

/** 保存済みコンテキストに当該部門の未保存編集を重ね、自動割当の判断へ反映する。 */
export function contextWithStagedAssignments(
  context: AutoAssignContext,
  stagedCells: Map<string, AutoAssignStagedCell>,
): AutoAssignContext {
  const assignments = context.existingAssignments.filter(
    (assignment) =>
      assignment.departmentCode !== context.departmentCode ||
      !stagedCells.has(`${assignment.date}:${assignment.shiftTypeId}`),
  );
  for (const [key, cell] of stagedCells) {
    const separator = key.indexOf(':');
    assignments.push({
      date: key.slice(0, separator),
      shiftTypeId: key.slice(separator + 1),
      departmentCode: context.departmentCode,
      instructorIds: cell.instructorIds,
    });
  }
  return { ...context, existingAssignments: assignments };
}
