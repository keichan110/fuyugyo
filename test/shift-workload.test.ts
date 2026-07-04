import { describe, expect, it } from 'vitest';

import { calculateInstructorWorkload, seasonRangeForDate } from '../src/features/shifts/workload';

describe('seasonRangeForDate', () => {
  it('年をまたぐ冬季シーズンを対象日から決定する', () => {
    expect(seasonRangeForDate('2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2026-04-30',
    });
    expect(seasonRangeForDate('2025-12-10')).toEqual({
      from: '2025-12-01',
      to: '2026-04-30',
    });
  });
});

describe('calculateInstructorWorkload', () => {
  const seasonRange = { from: '2025-12-01', to: '2026-04-30' };

  it('空入力でも対象日へ割り当てた後の 1 日として計算する', () => {
    expect(
      calculateInstructorWorkload({
        instructorId: 'inst-1',
        targetDate: '2026-01-15',
        assignedDates: [],
        seasonRange,
      }),
    ).toEqual({
      monthlyWorkDays: 1,
      seasonWorkDays: 1,
      consecutiveWeekends: 0,
      consecutiveWorkDays: 1,
      hasWarning: false,
    });
  });

  it('月内とシーズン累計の窓を別々に集計する', () => {
    const workload = calculateInstructorWorkload({
      instructorId: 'inst-1',
      targetDate: '2026-01-15',
      assignedDates: ['2025-11-30', '2025-12-20', '2026-01-01', '2026-02-01'],
      seasonRange,
    });

    expect(workload.monthlyWorkDays).toBe(2);
    expect(workload.seasonWorkDays).toBe(4);
  });

  it('連続勤務日は月境界・年境界をまたいで対象日から逆向きに数える', () => {
    const workload = calculateInstructorWorkload({
      instructorId: 'inst-1',
      targetDate: '2026-01-03',
      assignedDates: ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'],
      seasonRange,
    });

    expect(workload.consecutiveWorkDays).toBe(5);
    expect(workload.hasWarning).toBe(true);
  });

  it('連続勤務日は空白日で止まる', () => {
    const workload = calculateInstructorWorkload({
      instructorId: 'inst-1',
      targetDate: '2026-01-05',
      assignedDates: ['2026-01-01', '2026-01-03', '2026-01-04'],
      seasonRange,
    });

    expect(workload.consecutiveWorkDays).toBe(3);
  });

  it('連続週末は土日のどちらかに勤務があれば 1 週末として数える', () => {
    const workload = calculateInstructorWorkload({
      instructorId: 'inst-1',
      targetDate: '2026-01-18',
      assignedDates: ['2026-01-03', '2026-01-11'],
      seasonRange,
    });

    expect(workload.consecutiveWeekends).toBe(3);
    expect(workload.hasWarning).toBe(true);
  });

  it('連続週末は勤務のない週末で止まる', () => {
    const workload = calculateInstructorWorkload({
      instructorId: 'inst-1',
      targetDate: '2026-01-24',
      assignedDates: ['2026-01-10', '2026-01-11'],
      seasonRange,
    });

    expect(workload.consecutiveWeekends).toBe(1);
  });
});
