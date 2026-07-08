import { describe, expect, it } from 'vitest';

import {
  calculateFairShare,
  countCurrentMonthWorkDays,
  seasonRangeForDate,
  type CellAssignment,
} from '../src/features/shifts/workload';

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

describe('calculateFairShare', () => {
  it('空配列なら 0 を返す', () => {
    expect(calculateFairShare([])).toBe(0);
  });

  it('プール各人の総勤務日数の単純平均を返す', () => {
    expect(calculateFairShare([2, 4, 6])).toBe(4);
    expect(calculateFairShare([5])).toBe(5);
    expect(calculateFairShare([1, 2])).toBe(1.5);
  });
});

describe('countCurrentMonthWorkDays', () => {
  const cell = (
    date: string,
    departmentId: string,
    shiftTypeId: string,
    instructorIds: string[],
  ): CellAssignment => ({ date, departmentId, shiftTypeId, instructorIds });

  it('保存済み割り当てを部門横断で日数集計する', () => {
    const saved: CellAssignment[] = [
      cell('2026-01-05', 'dept-ski', 'st-am', ['inst-1']),
      cell('2026-01-06', 'dept-board', 'st-pm', ['inst-1', 'inst-2']),
    ];
    const result = countCurrentMonthWorkDays(saved, []);
    expect(result.get('inst-1')).toBe(2);
    expect(result.get('inst-2')).toBe(1);
  });

  it('同日に複数シフトへ入っていても1日として数える', () => {
    const saved: CellAssignment[] = [
      cell('2026-01-05', 'dept-ski', 'st-am', ['inst-1']),
      cell('2026-01-05', 'dept-ski', 'st-pm', ['inst-1']),
    ];
    const result = countCurrentMonthWorkDays(saved, []);
    expect(result.get('inst-1')).toBe(1);
  });

  it('現部門のステージ済みセルが対応する保存値を上書きする', () => {
    const saved: CellAssignment[] = [cell('2026-01-05', 'dept-ski', 'st-am', ['inst-1'])];
    // ステージで inst-1 を外し、代わりに inst-2 を割り当てた状態
    const staged: CellAssignment[] = [cell('2026-01-05', 'dept-ski', 'st-am', ['inst-2'])];
    const result = countCurrentMonthWorkDays(saved, staged);
    expect(result.get('inst-1')).toBeUndefined();
    expect(result.get('inst-2')).toBe(1);
  });

  it('空配列でステージすると保存済みの割り当てが消える（シフト削除相当）', () => {
    const saved: CellAssignment[] = [cell('2026-01-05', 'dept-ski', 'st-am', ['inst-1'])];
    const staged: CellAssignment[] = [cell('2026-01-05', 'dept-ski', 'st-am', [])];
    const result = countCurrentMonthWorkDays(saved, staged);
    expect(result.get('inst-1')).toBeUndefined();
  });

  it('他部門の保存済み割り当てはステージの影響を受けない', () => {
    const saved: CellAssignment[] = [cell('2026-01-05', 'dept-board', 'st-am', ['inst-1'])];
    // 現部門（dept-ski）の同日セルをステージしても、他部門の保存値には影響しない
    const staged: CellAssignment[] = [cell('2026-01-05', 'dept-ski', 'st-am', [])];
    const result = countCurrentMonthWorkDays(saved, staged);
    expect(result.get('inst-1')).toBe(1);
  });

  it('保存済みに存在しない新規ステージセルも加算する', () => {
    const staged: CellAssignment[] = [cell('2026-01-10', 'dept-ski', 'st-am', ['inst-3'])];
    const result = countCurrentMonthWorkDays([], staged);
    expect(result.get('inst-3')).toBe(1);
  });
});
