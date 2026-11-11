import { describe, expect, it } from 'vitest';

import {
  assignSeriesColors,
  buildShiftTypeMix,
} from '../src/features/season-analysis/shift-type-mix';
import { analysis, assign, filters } from './season-analysis-fixtures';

/** 勤務種別の構成比の集計純粋関数の単体テスト。 */

type Shift = ReturnType<typeof analysis>['shifts'][number];

function shiftType(
  shiftTypeId: string,
  shiftTypeName: string,
  departmentCode: 'ski' | 'snowboard' = 'ski',
): Shift {
  return {
    date: '2026-10-01',
    departmentCode,
    shiftTypeId,
    shiftTypeName,
    requiredCount: null,
    status: 'PUBLISHED',
    assignedCount: 0,
  };
}

const members = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  displayName: id,
  status: 'ACTIVE',
  qualifiedDepartments: ['ski' as const],
}));

const shifts = [
  shiftType('am', '一般レッスン'),
  shiftType('pm', 'ジュニア'),
  shiftType('am', '一般レッスン', 'snowboard'),
];

describe('buildShiftTypeMix', () => {
  it('枠単位の回数と割合を出し、同日2種別は各1回、配置0回の人は除外して人数を返す', () => {
    const mix = buildShiftTypeMix(
      analysis({
        instructors: members,
        shifts,
        assignments: [
          assign('a', '2026-10-01', { shiftTypeId: 'am' }),
          assign('a', '2026-10-01', { shiftTypeId: 'pm' }),
          assign('a', '2026-10-02', { shiftTypeId: 'am' }),
          assign('a', '2026-10-03', { shiftTypeId: 'am' }),
          assign('b', '2026-10-01', { shiftTypeId: 'pm' }),
        ],
      }),
      { ...filters, department: 'ski' },
    );
    expect(mix.series.map((s) => [s.label, s.total])).toEqual([
      ['一般レッスン', 3],
      ['ジュニア', 2],
    ]);
    const a = mix.members.find((m) => m.id === 'a');
    expect(a).toMatchObject({ total: 4, counts: { 'ski:am': 3, 'ski:pm': 1 } });
    expect(a?.shares['ski:am']).toBe(75);
    // c・d は配置なしで除外
    expect(mix.excludedCount).toBe(2);
  });

  it('メンバーは最多系列の割合の高い順、同率は合計回数→名前', () => {
    const mix = buildShiftTypeMix(
      analysis({
        instructors: members,
        shifts,
        assignments: [
          // 最多系列は ski:am。a=100%(1回)、b=100%(2回)、c=50%
          assign('a', '2026-10-01'),
          assign('b', '2026-10-01'),
          assign('b', '2026-10-02'),
          assign('c', '2026-10-01'),
          assign('c', '2026-10-02', { shiftTypeId: 'pm' }),
        ],
      }),
      { ...filters, department: 'ski' },
    );
    expect(mix.members.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('全体では「部門／種別」表示、部門のみ数えるときは種別名のみで他部門を含めない', () => {
    const data = analysis({
      shifts,
      assignments: [
        assign('a', '2026-10-01', { departmentCode: 'ski' }),
        assign('a', '2026-10-02', { departmentCode: 'snowboard' }),
      ],
    });
    expect(
      buildShiftTypeMix(data, filters)
        .series.map((s) => s.label)
        .sort(),
    ).toEqual(['スキー／一般レッスン', 'スノーボード／一般レッスン']);
    const only = buildShiftTypeMix(data, {
      department: 'ski',
      includeDrafts: true,
    });
    expect(only.series.map((s) => s.label)).toEqual(['一般レッスン']);
    expect(only.members[0]?.total).toBe(1);
  });

  it('下書きを除外でき、部門内は回数の多い順に並ぶ', () => {
    const data = analysis({
      shifts,
      assignments: [
        assign('a', '2026-10-01', { shiftTypeId: 'pm' }),
        assign('a', '2026-10-02', { shiftTypeId: 'pm' }),
        assign('a', '2026-10-03', { shiftTypeId: 'am' }),
        assign('a', '2026-10-04', { shiftTypeId: 'am', shiftStatus: 'DRAFT' }),
      ],
    });
    const mix = buildShiftTypeMix(data, { ...filters, department: 'ski' });
    expect(mix.series.map((s) => [s.key, s.total])).toEqual([
      ['ski:am', 2],
      ['ski:pm', 2],
    ]);
    const published = buildShiftTypeMix(data, {
      ...filters,
      department: 'ski',
      includeDrafts: false,
    });
    expect(published.series.map((s) => [s.key, s.total])).toEqual([
      ['ski:pm', 2],
      ['ski:am', 1],
    ]);
  });

  it('絞り込みで系列が減っても、残った系列の色は変わらない', () => {
    const data = analysis({
      shifts,
      assignments: [
        assign('a', '2026-10-01', { shiftTypeId: 'am', shiftStatus: 'DRAFT' }),
        assign('a', '2026-10-02', { shiftTypeId: 'pm' }),
      ],
    });
    const colorOf = (mix: ReturnType<typeof buildShiftTypeMix>, key: string) =>
      mix.series.find((s) => s.key === key)?.color;
    const withDrafts = buildShiftTypeMix(data, filters);
    const published = buildShiftTypeMix(data, { ...filters, includeDrafts: false });
    expect(published.series.map((s) => s.key)).toEqual(['ski:pm']);
    expect(colorOf(published, 'ski:pm')).toBe(colorOf(withDrafts, 'ski:pm'));
  });
});

describe('assignSeriesColors', () => {
  const entries = [
    { key: 'ski:b', departmentCode: 'ski' as const, shiftTypeId: 'b' },
    { key: 'ski:a', departmentCode: 'ski' as const, shiftTypeId: 'a' },
    { key: 'snowboard:a', departmentCode: 'snowboard' as const, shiftTypeId: 'a' },
  ];

  it('同部門は部門色の同系色で、シェードは部門内で重複しない', () => {
    const colors = assignSeriesColors(entries);
    expect(colors.get('ski:a')).toBe('blue.7');
    expect(colors.get('ski:b')).toBe('blue.5');
    expect(colors.get('snowboard:a')).toBe('orange.7');
  });

  it('他部門の有無や入力順に関わらず同じ系列は同じ色になる', () => {
    const all = assignSeriesColors(entries);
    const skiOnly = assignSeriesColors(
      [...entries].reverse().filter((e) => e.departmentCode === 'ski'),
    );
    expect(skiOnly.get('ski:a')).toBe(all.get('ski:a'));
    expect(skiOnly.get('ski:b')).toBe(all.get('ski:b'));
  });

  it('種別が多くてもシェード候補を循環して破綻しない', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      key: `ski:${i}`,
      departmentCode: 'ski' as const,
      shiftTypeId: String(i).padStart(2, '0'),
    }));
    const colors = assignSeriesColors(many);
    expect(colors.size).toBe(10);
    expect([...colors.values()].every((c) => c.startsWith('blue.'))).toBe(true);
  });
});
