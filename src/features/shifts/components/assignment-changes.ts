import type { ShiftViewItem } from '../schema';
import type { SavedRequirements, StagedRequirements } from './requirement-stage';
import type { StagedCell } from './shift-manager-types';

/** 日付・種別ごとの保存済みから現在案への変更。 */
export type AssignmentChange = {
  key: string;
  date: string;
  shiftTypeId: string;
  addedIds: string[];
  removedIds: string[];
  currentIds: string[];
  beforeRequired: number | null;
  afterRequired: number | null;
  requiredChanged: boolean;
  beforeDescription: string;
  afterDescription: string;
  descriptionChanged: boolean;
};

/** 当月・担当部門の全種別について、担当者・必要人数・備考の実際の変更だけを導く。 */
export function buildAssignmentChanges({
  days,
  shiftByCell,
  stagedCells,
  savedRequirements,
  stagedRequirements,
}: {
  days: readonly string[];
  shiftByCell: ReadonlyMap<string, ShiftViewItem>;
  stagedCells: ReadonlyMap<string, StagedCell>;
  savedRequirements: SavedRequirements;
  stagedRequirements: StagedRequirements;
}): AssignmentChange[] {
  const monthDays = new Set(days);
  const keys = new Set([...stagedCells.keys(), ...stagedRequirements.keys()]);
  const changes: AssignmentChange[] = [];
  for (const key of keys) {
    const date = key.slice(0, 10);
    if (!monthDays.has(date)) continue;
    const saved = shiftByCell.get(key);
    const staged = stagedCells.get(key);
    const beforeIds = new Set(saved?.assignedInstructors.map((person) => person.id) ?? []);
    const currentIds = new Set(staged ? staged.instructorIds : beforeIds);
    const addedIds = [...currentIds].filter((id) => !beforeIds.has(id));
    const removedIds = [...beforeIds].filter((id) => !currentIds.has(id));
    const beforeRequired = savedRequirements.get(key) ?? null;
    const stagedRequired = stagedRequirements.get(key);
    const afterRequired = stagedRequired ? stagedRequired.requiredCount : beforeRequired;
    const beforeDescription = saved?.description ?? '';
    const afterDescription = staged ? staged.description : beforeDescription;
    const requiredChanged = beforeRequired !== afterRequired;
    const descriptionChanged = beforeDescription !== afterDescription;
    if (!addedIds.length && !removedIds.length && !requiredChanged && !descriptionChanged) continue;
    changes.push({
      key,
      date,
      shiftTypeId: key.slice(11),
      addedIds,
      removedIds,
      currentIds: [...currentIds],
      beforeRequired,
      afterRequired,
      requiredChanged,
      beforeDescription,
      afterDescription,
      descriptionChanged,
    });
  }
  return changes.sort((a, b) => a.key.localeCompare(b.key));
}
