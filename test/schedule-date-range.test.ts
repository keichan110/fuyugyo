import { describe, expect, it } from 'vitest';

import { clampScheduleMonth, scheduleMaximumDate, scheduleToday } from '@/lib/schedule-date-range';

describe('勤務可否の入力期間', () => {
  it.each([
    ['2026-11-13', '2027-11-30'],
    ['2026-12-31', '2027-12-31'],
    ['2027-02-28', '2028-02-29'],
    ['2028-02-29', '2029-02-28'],
  ])('%s の翌年同月の末日は %s', (today, expected) => {
    expect(scheduleMaximumDate(today)).toBe(expected);
  });
  it('日本時間の月替わりで当日と上限を切り替える', () => {
    expect(scheduleToday(new Date('2026-11-30T14:59:59Z'))).toBe('2026-11-30');
    const today = scheduleToday(new Date('2026-11-30T15:00:00Z'));
    expect(today).toBe('2026-12-01');
    expect(scheduleMaximumDate(today)).toBe('2027-12-31');
  });
  it('上限を超える表示月を収め、過去月は閲覧できる', () => {
    expect(clampScheduleMonth('9999-12', '2026-11-13')).toBe('2027-11');
    expect(clampScheduleMonth('2027-11', '2026-11-13')).toBe('2027-11');
    expect(clampScheduleMonth('2025-01', '2026-11-13')).toBe('2025-01');
  });
});
