import type { PublishShiftsInput, ShiftViewItem } from '../schema';
import { cellKey } from './shift-manager-utils';

type PublicationScope = Pick<PublishShiftsInput, 'month' | 'departmentCode' | 'shiftTypeId'>;

/** 表示用の日付をyyyy/mm/dd形式に揃える。 */
export function formatPublicationDate(date: string): string {
  return date.replaceAll('-', '/');
}

/** 月初から終了日までを公開、残りを非公開にする計画と、確認した版を生成する。 */
export function planPublicationWindow(
  scope: PublicationScope,
  days: readonly string[],
  through: string | null,
  saved: ReadonlyMap<string, ShiftViewItem>,
): PublishShiftsInput {
  return {
    ...scope,
    status: 'PUBLISHED',
    dates: days.map((date) => {
      const shift = saved.get(cellKey(date, scope.shiftTypeId));
      return {
        date,
        status: through !== null && date <= through ? 'PUBLISHED' : 'DRAFT',
        expectedRevision: shift?.revision ?? null,
        expectedShiftId: shift?.id ?? null,
      };
    }),
  };
}

/** 公開範囲変更で実際に公開・非公開になる枠と、0名・不足の件数を算出する。 */
export function summarizePublicationChanges(
  input: PublishShiftsInput,
  saved: ReadonlyMap<string, ShiftViewItem>,
) {
  let publishCount = 0;
  let unpublishCount = 0;
  let zeroCount = 0;
  let shortCount = 0;
  for (const item of input.dates) {
    const shift = saved.get(cellKey(item.date, input.shiftTypeId));
    const status = item.status ?? input.status;
    if (status === 'PUBLISHED' && shift?.status !== 'PUBLISHED') {
      publishCount++;
      const assigned = shift?.assignedInstructors.length ?? 0;
      if (assigned === 0) zeroCount++;
      if (
        shift?.requiredCount !== null &&
        shift?.requiredCount !== undefined &&
        assigned < shift.requiredCount
      )
        shortCount++;
    }
    if (status === 'DRAFT' && shift?.status === 'PUBLISHED') unpublishCount++;
  }
  return { publishCount, unpublishCount, zeroCount, shortCount };
}
