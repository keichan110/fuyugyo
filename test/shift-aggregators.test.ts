import { describe, expect, it } from 'vitest';

import {
  aggregateByDepartment,
  calculateTotalAssignments,
  groupShiftsByWorkingDay,
  summarizeShifts,
} from '../src/features/shifts/aggregators';
import type { ShiftViewItem } from '../src/features/shifts/schema';

/**
 * シフト集計純粋関数の単体テスト（DB 非依存）。
 * 旧 usecases から移植した集計ロジックの正しさを継ぎ目なしに検証する。
 */

/** テスト用のシフト1件を生成するヘルパー */
function makeShift(
  departmentName: string,
  instructorCount: number,
  overrides: Partial<ShiftViewItem> = {},
): ShiftViewItem {
  return {
    id: crypto.randomUUID(),
    date: '2026-01-15',
    description: null,
    department: { id: `dept-${departmentName}`, name: departmentName, code: 'X' },
    shiftType: { id: 'st', name: '終日' },
    assignedInstructors: Array.from({ length: instructorCount }, (_, i) => ({
      id: `inst-${i}`,
      displayName: `講師 ${i}`,
    })),
    ...overrides,
  };
}

describe('aggregateByDepartment', () => {
  it('部門名ごとにシフト件数を集計する', () => {
    const shifts = [makeShift('スキー', 2), makeShift('スキー', 1), makeShift('スノーボード', 3)];
    expect(aggregateByDepartment(shifts)).toEqual({
      スキー: 2,
      スノーボード: 1,
    });
  });

  it('空配列なら空オブジェクトを返す', () => {
    expect(aggregateByDepartment([])).toEqual({});
  });
});

describe('calculateTotalAssignments', () => {
  it('全シフトの割り当て数を合計する', () => {
    const shifts = [makeShift('スキー', 2), makeShift('スノーボード', 3), makeShift('スキー', 0)];
    expect(calculateTotalAssignments(shifts)).toBe(5);
  });

  it('空配列なら 0 を返す', () => {
    expect(calculateTotalAssignments([])).toBe(0);
  });
});

describe('summarizeShifts', () => {
  it('件数・割り当て総数・期間・部門別集計をまとめて返す', () => {
    const shifts = [makeShift('スキー', 2), makeShift('スキー', 1), makeShift('スノーボード', 3)];
    const summary = summarizeShifts(shifts, {
      from: '2026-01-13',
      to: '2026-01-19',
    });
    expect(summary).toEqual({
      totalShifts: 3,
      totalAssignments: 6,
      dateRange: { from: '2026-01-13', to: '2026-01-19' },
      byDepartment: { スキー: 2, スノーボード: 1 },
    });
  });

  it('シフトが無くても期間と 0 件のサマリを返す', () => {
    const summary = summarizeShifts([], {
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(summary).toEqual({
      totalShifts: 0,
      totalAssignments: 0,
      dateRange: { from: '2026-02-01', to: '2026-02-28' },
      byDepartment: {},
    });
  });
});

describe('groupShiftsByWorkingDay', () => {
  it('稼働日のみを日付昇順にまとめ、休校日は生成しない', () => {
    const shifts = [
      makeShift('スノーボード', 1, { date: '2026-01-12' }),
      makeShift('スキー', 2, { date: '2026-01-10' }),
      makeShift('スキー', 1, { date: '2026-01-12' }),
    ];

    const days = groupShiftsByWorkingDay(shifts);

    expect(days.map((day) => day.date)).toEqual(['2026-01-10', '2026-01-12']);
    expect(days.flatMap((day) => day.date)).not.toContain('2026-01-11');
    expect(days[0]?.shifts.map((shift) => shift.department.name)).toEqual(['スキー']);
    expect(days[1]?.shifts.map((shift) => shift.department.name)).toEqual([
      'スキー',
      'スノーボード',
    ]);
  });
});
