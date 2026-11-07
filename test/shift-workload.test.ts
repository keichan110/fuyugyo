import { describe, expect, it } from 'vitest';

import { SEASON_END_MONTH, SEASON_START_MONTH } from '../src/features/shifts/season';
import {
  calculateFairShare,
  classifyWorkDay,
  composeInstructorMonthWork,
  computeWorkStreak,
  computeWorkWeekStreak,
  countCurrentMonthWorkDays,
  seasonRangeForDate,
  summarizeInstructorWorkload,
  type CellAssignment,
  type DetailedCellAssignment,
} from '../src/features/shifts/workload';

describe('seasonRangeForDate', () => {
  it('デフォルトは共通定数（9月始まり〜8月終わり）のシーズン範囲を返す', () => {
    expect(SEASON_START_MONTH).toBe(9);
    expect(SEASON_END_MONTH).toBe(8);
    expect(seasonRangeForDate('2026-01-15')).toEqual({
      from: '2025-09-01',
      to: '2026-08-31',
    });
    expect(seasonRangeForDate('2025-12-10')).toEqual({
      from: '2025-09-01',
      to: '2026-08-31',
    });
  });

  it('シーズン開始月の前日と当日で属するシーズンが切り替わる（9月カットオーバー）', () => {
    expect(seasonRangeForDate('2026-08-31')).toEqual({
      from: '2025-09-01',
      to: '2026-08-31',
    });
    expect(seasonRangeForDate('2026-09-01')).toEqual({
      from: '2026-09-01',
      to: '2027-08-31',
    });
  });

  it('任意のシーズン境界（例: 年をまたぐ冬季12〜4月）も指定できる', () => {
    expect(seasonRangeForDate('2026-01-15', 12, 4)).toEqual({
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
    departmentCode: string,
    shiftTypeId: string,
    instructorIds: string[],
  ): CellAssignment => ({ date, departmentCode, shiftTypeId, instructorIds });

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

describe('computeWorkStreak', () => {
  const season = { from: '2025-09-01', to: '2026-08-31' };

  it('基準日のみなら1連勤', () => {
    expect(computeWorkStreak([], '2026-01-10', season)).toEqual({
      days: 1,
      from: '2026-01-10',
      to: '2026-01-10',
    });
  });

  it('前後両方向へ月をまたいで連結する', () => {
    expect(
      computeWorkStreak(
        ['2026-01-30', '2026-01-31', '2026-02-02', '2026-02-03'],
        '2026-02-01',
        season,
      ),
    ).toEqual({ days: 5, from: '2026-01-30', to: '2026-02-03' });
  });

  it('離れた勤務日や重複は連勤に含めない', () => {
    expect(
      computeWorkStreak(['2026-01-08', '2026-01-11', '2026-01-11'], '2026-01-10', season),
    ).toEqual({
      days: 2,
      from: '2026-01-10',
      to: '2026-01-11',
    });
  });

  it('シーズン境界で打ち切る', () => {
    expect(
      computeWorkStreak(['2025-08-31', '2025-09-01', '2025-09-02'], '2025-09-02', season),
    ).toEqual({ days: 2, from: '2025-09-01', to: '2025-09-02' });
    expect(computeWorkStreak(['2026-08-31', '2026-09-01'], '2026-08-30', season)).toEqual({
      days: 2,
      from: '2026-08-30',
      to: '2026-08-31',
    });
  });
});

describe('computeWorkWeekStreak', () => {
  const season = { from: '2025-09-01', to: '2026-08-31' };

  it('基準日の週のみなら1週（月曜始まり）', () => {
    // 2026-01-07 は水曜。週の月曜は 2026-01-05
    expect(computeWorkWeekStreak([], '2026-01-07', season)).toEqual({
      weeks: 1,
      fromWeekStart: '2026-01-05',
      toWeekStart: '2026-01-05',
    });
  });

  it('1日でも勤務がある週が前後に続けば連結し、月をまたぐ', () => {
    // 1/4(日) は 12/29 の週、1/14(水) は 1/12 の週、1/20(火) は 1/19 の週
    expect(
      computeWorkWeekStreak(['2026-01-04', '2026-01-14', '2026-01-20'], '2026-01-07', season),
    ).toEqual({ weeks: 4, fromWeekStart: '2025-12-29', toWeekStart: '2026-01-19' });
  });

  it('勤務のない週で途切れる', () => {
    expect(computeWorkWeekStreak(['2026-01-21'], '2026-01-07', season)).toEqual({
      weeks: 1,
      fromWeekStart: '2026-01-05',
      toWeekStart: '2026-01-05',
    });
  });

  it('シーズン外の勤務日は数えない', () => {
    expect(computeWorkWeekStreak(['2025-08-28'], '2025-09-02', season)).toEqual({
      weeks: 1,
      fromWeekStart: '2025-09-01',
      toWeekStart: '2025-09-01',
    });
  });
});

describe('composeInstructorMonthWork / classifyWorkDay', () => {
  const cell = (
    date: string,
    departmentCode: string,
    shiftTypeId: string,
    instructorIds: string[],
  ): DetailedCellAssignment => ({
    date,
    departmentCode,
    shiftTypeId,
    instructorIds,
    shiftTypeName: `種別${shiftTypeId}`,
  });
  const current = { departmentCode: 'ski', shiftTypeId: 'am' };

  it('保存済み全部門とステージ済みを合成し、ステージ済みセルは保存値を上書きする', () => {
    const work = composeInstructorMonthWork(
      [
        cell('2026-01-10', 'ski', 'am', ['a']),
        cell('2026-01-11', 'snowboard', 'am', ['a']),
        cell('2026-01-12', 'ski', 'pm', ['a']),
        cell('2026-01-13', 'ski', 'am', ['b']),
      ],
      [cell('2026-01-10', 'ski', 'am', []), cell('2026-01-14', 'ski', 'am', ['a'])],
      'a',
    );
    expect([...work.keys()].sort()).toEqual(['2026-01-11', '2026-01-12', '2026-01-14']);
    expect(classifyWorkDay(work.get('2026-01-10'), current)).toBeNull();
    expect(classifyWorkDay(work.get('2026-01-11'), current)).toBe('otherDepartment');
    expect(classifyWorkDay(work.get('2026-01-12'), current)).toBe('sameDepartmentOtherType');
    expect(classifyWorkDay(work.get('2026-01-14'), current)).toBe('current');
  });

  it('同日に複数あれば current > otherDepartment > sameDepartmentOtherType で代表を選ぶ', () => {
    const entry = (departmentCode: string, shiftTypeId: string) => ({
      departmentCode,
      shiftTypeId,
      shiftTypeName: shiftTypeId,
    });
    expect(
      classifyWorkDay([entry('ski', 'pm'), entry('snowboard', 'am'), entry('ski', 'am')], current),
    ).toBe('current');
    expect(classifyWorkDay([entry('ski', 'pm'), entry('snowboard', 'am')], current)).toBe(
      'otherDepartment',
    );
    expect(classifyWorkDay([entry('ski', 'pm')], current)).toBe('sameDepartmentOtherType');
  });
});

describe('summarizeInstructorWorkload', () => {
  const season = { from: '2025-09-01', to: '2026-08-31' };
  const current = { departmentCode: 'ski', shiftTypeId: 'am' };
  const entry = (departmentCode: string, shiftTypeId: string) => ({
    departmentCode,
    shiftTypeId,
    shiftTypeName: shiftTypeId,
  });

  it('選択枠がなければ日数のみで連勤・週数は null', () => {
    const monthWork = new Map([['2026-02-02', [entry('ski', 'am')]]]);
    expect(
      summarizeInstructorWorkload({
        monthWork,
        workDatesOutsideMonth: ['2026-01-31'],
        season,
        selectedDate: null,
        current,
      }),
    ).toEqual({
      monthDays: 1,
      seasonDays: 2,
      isAddition: false,
      addedDays: 0,
      streak: null,
      weekStreak: null,
    });
  });

  it('未配置なら選択日を加えた連勤・週数と +1日を返し、日数は現在案のまま', () => {
    const monthWork = new Map([['2026-02-02', [entry('ski', 'am')]]]);
    const summary = summarizeInstructorWorkload({
      monthWork,
      workDatesOutsideMonth: ['2026-01-31'],
      season,
      selectedDate: '2026-02-01',
      current,
    });
    expect(summary).toMatchObject({
      monthDays: 1,
      seasonDays: 2,
      isAddition: true,
      addedDays: 1,
      streak: { days: 3, from: '2026-01-31', to: '2026-02-02' },
    });
  });

  it('同日に別勤務がある未配置は +0日、配置済みは現在案', () => {
    const monthWork = new Map([['2026-02-02', [entry('snowboard', 'am')]]]);
    expect(
      summarizeInstructorWorkload({
        monthWork,
        workDatesOutsideMonth: [],
        season,
        selectedDate: '2026-02-02',
        current,
      }),
    ).toMatchObject({ isAddition: true, addedDays: 0, monthDays: 1 });

    const placed = new Map([['2026-02-02', [entry('ski', 'am')]]]);
    expect(
      summarizeInstructorWorkload({
        monthWork: placed,
        workDatesOutsideMonth: [],
        season,
        selectedDate: '2026-02-02',
        current,
      }),
    ).toMatchObject({ isAddition: false, addedDays: 0, streak: { days: 1 } });
  });
});
