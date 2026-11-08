import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

import type { ShiftViewItem } from '../schema';
import type { SelectedCell, StagedCell } from './shift-manager-types';
import { cellKey } from './shift-manager-utils';

/** 同日の競合先を算出する。未保存の追加・全解除も保存済み配置より優先する。 */
export function assignmentConflictLabels({
  selectedCell,
  departmentCode,
  shiftTypes,
  stagedCells,
  savedShifts,
}: {
  selectedCell: SelectedCell;
  departmentCode: DepartmentCode;
  shiftTypes: readonly { id: string; name: string }[];
  stagedCells: ReadonlyMap<string, Pick<StagedCell, 'instructorIds'>>;
  savedShifts: readonly Pick<
    ShiftViewItem,
    'date' | 'department' | 'shiftType' | 'assignedInstructors'
  >[];
}): Map<string, string> {
  const map = new Map<string, string>();
  const { date, shiftTypeId } = selectedCell;
  const deptName = getDepartmentAppearance(departmentCode).label;
  const add = (ids: string[], label: string) => {
    for (const id of ids) if (!map.has(id)) map.set(id, label);
  };
  for (const st of shiftTypes) {
    if (st.id === shiftTypeId) continue;
    const staged = stagedCells.get(cellKey(date, st.id));
    const ids = staged
      ? staged.instructorIds
      : (savedShifts
          .find(
            (shift) =>
              shift.date === date &&
              shift.department.code === departmentCode &&
              shift.shiftType.id === st.id,
          )
          ?.assignedInstructors.map((instructor) => instructor.id) ?? []);
    add(ids, `${deptName} / ${st.name}`);
  }
  for (const shift of savedShifts) {
    if (shift.date !== date || shift.department.code === departmentCode) continue;
    add(
      shift.assignedInstructors.map((instructor) => instructor.id),
      `${shift.department.name} / ${shift.shiftType.name}`,
    );
  }
  return map;
}
