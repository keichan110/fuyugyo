import { describe, expect, it } from 'vitest';

import {
  monthlyPlacementData,
  monthlyPlacementDistribution,
} from '../src/features/shifts/components/monthly-placement-data';
import { monthlyStaffingDistribution } from '../src/features/shifts/components/monthly-staffing-data';
import {
  staffingBackground,
  staffingRate,
} from '../src/features/shifts/components/staffing-appearance';
import { weeklyPlacementData } from '../src/features/shifts/components/weekly-placement-data';
import type { WorkEntry } from '../src/features/shifts/workload';

describe('カレンダーの充足率', () => {
  it('同じ不足1人でも1/2と9/10を区別し、同じ率なら同じ背景になる', () => {
    expect(staffingRate(2, 1)).toBe(50);
    expect(staffingRate(10, 9)).toBe(90);
    expect(staffingBackground(2, 1)).not.toBe(staffingBackground(10, 9));
    expect(staffingBackground(2, 1)).toBe(staffingBackground(10, 5));
  });

  it('未設定と0人の比率は未定義とし、0人に配置がある場合は過員で表示する', () => {
    expect(staffingRate(null, 3)).toBeNull();
    expect(staffingRate(0, 0)).toBeNull();
    expect(staffingRate(0, 3)).toBeNull();
    expect(staffingBackground(null, 3)).toBe(staffingBackground(0, 0));
    expect(staffingBackground(0, 3)).not.toBe(staffingBackground(0, 0));
    expect(staffingRate(2, 3)).toBe(150);
    expect(staffingBackground(2, 1)).not.toBe(staffingBackground(2, 3));
  });
});

describe('週ごとの全部門勤務と表示枠の比較', () => {
  it('月初の部分週と月曜始まりを分け、兼任・同日複数勤務を重複計上しない', () => {
    const current = { departmentCode: 'SKI', shiftTypeId: 'lesson' };
    const ski: WorkEntry = { ...current, shiftTypeName: 'レッスン' };
    const snowboard: WorkEntry = {
      departmentCode: 'SNOWBOARD',
      shiftTypeId: 'lesson',
      shiftTypeName: 'レッスン',
    };
    const work = new Map([
      ['2026-11-01', [ski, snowboard]],
      ['2026-11-02', [snowboard]],
      ['2026-11-03', [ski, { ...ski, shiftTypeId: 'other' }, { ...ski, shiftTypeId: 'another' }]],
    ]);
    const result = weeklyPlacementData(
      ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
      work,
      current,
    );
    expect(
      result.map(({ current, sameDepartmentOtherType, otherDepartment }) => ({
        current,
        sameDepartmentOtherType,
        otherDepartment,
      })),
    ).toEqual([
      { current: 1, sameDepartmentOtherType: 0, otherDepartment: 1 },
      { current: 1, sameDepartmentOtherType: 1, otherDepartment: 1 },
    ]);
    expect(weeklyPlacementData([], work, current)).toEqual([]);
  });
});

describe('月全体のメンバー比較', () => {
  it('他部門勤務・同日の重複・未保存の解除と追加・0日を反映し、全部門の合計順に並べる', () => {
    const result = monthlyPlacementData({
      people: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      savedAssignments: [
        {
          date: '2026-11-01',
          departmentCode: 'ski',
          shiftTypeId: 'lesson',
          shiftTypeName: '講習',
          instructorIds: ['a'],
        },
        {
          date: '2026-11-01',
          departmentCode: 'snowboard',
          shiftTypeId: 'lesson',
          shiftTypeName: '講習',
          instructorIds: ['a'],
        },
        {
          date: '2026-11-02',
          departmentCode: 'snowboard',
          shiftTypeId: 'lesson',
          shiftTypeName: '講習',
          instructorIds: ['a'],
        },
        {
          date: '2026-11-02',
          departmentCode: 'ski',
          shiftTypeId: 'other',
          shiftTypeName: '別種別',
          instructorIds: ['a'],
        },
        {
          date: '2026-11-03',
          departmentCode: 'ski',
          shiftTypeId: 'lesson',
          shiftTypeName: '講習',
          instructorIds: ['a'],
        },
      ],
      stagedAssignments: [
        {
          date: '2026-11-03',
          departmentCode: 'ski',
          shiftTypeId: 'lesson',
          shiftTypeName: '講習',
          instructorIds: ['b'],
        },
      ],
    });
    expect(result.map(({ id, total }) => ({ id, total }))).toEqual([
      { id: 'a', total: 2 },
      { id: 'b', total: 1 },
      { id: 'c', total: 0 },
    ]);
    const distribution = monthlyPlacementDistribution(result);
    expect(distribution.median).toBe(1);
    expect(distribution.bins.map(({ days, count }) => ({ days, count }))).toEqual([
      { days: 0, count: 1 },
      { days: 1, count: 1 },
      { days: 2, count: 1 },
    ]);
  });
});

describe('勤務日数の分布と中央値', () => {
  it('偶数人数の中央値を補間し、空の階級を埋めて各人を1回だけ数える', () => {
    const result = monthlyPlacementDistribution([
      { id: 'a', name: 'A', total: 0 },
      { id: 'b', name: 'B', total: 1 },
      { id: 'c', name: 'C', total: 4 },
      { id: 'd', name: 'D', total: 4 },
    ]);
    expect(result.median).toBe(2.5);
    expect(result.bins.map((bin) => bin.count)).toEqual([1, 1, 0, 0, 2]);
    expect(result.bins.flatMap((bin) => bin.members.map((person) => person.id)).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
  it('全員0日と対象者なしを区別する', () => {
    const zero = monthlyPlacementDistribution([{ id: 'a', name: 'A', total: 0 }]);
    expect(zero.median).toBe(0);
    expect(zero.bins.map((bin) => bin.count)).toEqual([1]);
    expect(monthlyPlacementDistribution([])).toEqual({ bins: [], median: null });
  });
});

describe('月全体の充足状況', () => {
  it('未設定・開講なし・不足・充足・過員を重複なく集計し、0名設定への配置も過員に含める', () => {
    const result = monthlyStaffingDistribution([
      { required: null, assigned: 4 },
      { required: 0, assigned: 0 },
      { required: 0, assigned: 1 },
      { required: 2, assigned: 1 },
      { required: 2, assigned: 2 },
      { required: 2, assigned: 3 },
    ]);
    expect(result.map(({ status, count }) => ({ status, count }))).toEqual([
      { status: 'short', count: 1 },
      { status: 'filled', count: 1 },
      { status: 'over', count: 2 },
      { status: 'unset', count: 1 },
      { status: 'notPlanned', count: 1 },
    ]);
    expect(result.reduce((sum, item) => sum + item.count, 0)).toBe(6);
    expect(monthlyStaffingDistribution([]).every((item) => item.count === 0)).toBe(true);
  });
});
