export type ShiftManagerSelection = {
  date: string;
  shiftTypeId: string;
};

type ReconcileShiftManagerSelectionInput = {
  selection: ShiftManagerSelection | null;
  days: string[];
  shiftTypeIds: string[];
};

/**
 * 表示月・シフト種別一覧の変更後に、シフト管理画面の選択状態を有効な値へ補正する。
 */
export function reconcileShiftManagerSelection({
  selection,
  days,
  shiftTypeIds,
}: ReconcileShiftManagerSelectionInput): ShiftManagerSelection | null {
  const firstDay = days[0];
  const firstShiftTypeId = shiftTypeIds[0];
  if (!firstDay || !firstShiftTypeId) {
    return null;
  }
  if (!selection) {
    return { date: firstDay, shiftTypeId: firstShiftTypeId };
  }
  const shiftTypeId = shiftTypeIds.includes(selection.shiftTypeId)
    ? selection.shiftTypeId
    : firstShiftTypeId;
  const date = days.includes(selection.date) ? selection.date : firstDay;
  return { date, shiftTypeId };
}
