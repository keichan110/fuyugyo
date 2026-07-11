import { describe, expect, it } from 'vitest';

import { reconcileShiftManagerSelection } from '@/features/shifts/components/shift-manager-selection';

describe('reconcileShiftManagerSelection', () => {
  it('月を変更しても選択中のシフト種別を維持する', () => {
    expect(
      reconcileShiftManagerSelection({
        selection: { date: '2026-07-11', shiftTypeId: 'afternoon' },
        days: ['2026-08-01', '2026-08-02'],
        shiftTypeIds: ['all-day', 'afternoon'],
      }),
    ).toEqual({ date: '2026-08-01', shiftTypeId: 'afternoon' });
  });

  it('選択中のシフト種別が存在しなくなった場合は先頭へ補正する', () => {
    expect(
      reconcileShiftManagerSelection({
        selection: { date: '2026-07-11', shiftTypeId: 'afternoon' },
        days: ['2026-07-11', '2026-07-12'],
        shiftTypeIds: ['all-day'],
      }),
    ).toEqual({ date: '2026-07-11', shiftTypeId: 'all-day' });
  });
});
