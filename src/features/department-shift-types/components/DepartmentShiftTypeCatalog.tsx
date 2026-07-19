import { ShiftTypeList, type ShiftTypeDrawerState } from '@/features/shift-types';

/** 共有シフト種別マスタを表示し、登録・編集フォームを開くパネル。 */
export function DepartmentShiftTypeCatalog({
  onOpenForm,
}: {
  onOpenForm?: (state: ShiftTypeDrawerState) => void;
}) {
  return <ShiftTypeList {...(onOpenForm ? { onOpenForm } : {})} />;
}
