import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

/** シフト管理で選択した部門。未選択・不正な値は入口画面として扱う。 */
export type ShiftManagerSearch = { department?: DepartmentCode };

/** URL の部門だけを検証し、明示的に選ばれた有効な部門を復元する。 */
export function parseShiftManagerSearch(search: Record<string, unknown>): ShiftManagerSearch {
  const department = departmentCodeSchema.safeParse(search.department);
  return department.success ? { department: department.data } : {};
}
