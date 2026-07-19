import { describe, expect, it } from 'vitest';

import { getCalendarDayColor, isJapaneseHoliday } from '@/features/shifts/view-utils';

describe('isJapaneseHoliday', () => {
  it('国民の祝日と振替休日を判定する', () => {
    expect(isJapaneseHoliday('2026-02-11')).toBe(true);
    expect(isJapaneseHoliday('2026-05-06')).toBe(true);
  });

  it('祝日ではない平日は判定しない', () => {
    expect(isJapaneseHoliday('2026-02-12')).toBe(false);
  });

  it('日曜・祝日は赤、土曜は青を返す', () => {
    expect(getCalendarDayColor('2026-02-11')).toBe('red');
    expect(getCalendarDayColor('2026-02-14')).toBe('blue');
    expect(getCalendarDayColor('2026-02-12')).toBeUndefined();
  });
});
