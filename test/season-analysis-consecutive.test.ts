import { describe, expect, it } from 'vitest';

import {
  buildBurden,
  resolveBaseWeek,
  splitIntoRuns,
} from '../src/features/season-analysis/consecutive';
import type { SeasonAnalysis } from '../src/features/season-analysis/schema';
import { analysis, assign, filters } from './season-analysis-fixtures';

/** 負担（連勤・連続勤務週）の集計純粋関数の単体テスト。基準日は 2026-11-10（火）。 */

function shift(
  date: string,
  departmentCode: 'ski' | 'snowboard' = 'ski',
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
): SeasonAnalysis['shifts'][number] {
  return {
    date,
    departmentCode,
    shiftTypeId: 'am',
    shiftTypeName: '午前',
    requiredCount: null,
    status,
    assignedCount: 0,
  };
}

function member(view: ReturnType<typeof buildBurden>, id: string) {
  const found = view.members.find((m) => m.id === id);
  if (!found) throw new Error(`member ${id} not found`);
  return found;
}

describe('splitIntoRuns', () => {
  it('暦日の連続で分割し、同日重複を1日と数え、月またぎも連続とみなす', () => {
    expect(
      splitIntoRuns(['2026-10-31', '2026-11-01', '2026-11-01', '2026-11-02', '2026-11-04']),
    ).toEqual([
      { from: '2026-10-31', to: '2026-11-02', days: 3 },
      { from: '2026-11-04', to: '2026-11-04', days: 1 },
    ]);
  });
});

describe('buildBurden', () => {
  it('最大連勤は同日複数を1日と数え、月またぎでつながる。しきい値なしで数値をそのまま出す', () => {
    const view = buildBurden(
      analysis({
        assignments: [
          assign('a', '2026-09-30', { shiftTypeId: 'am' }),
          assign('a', '2026-09-30', { shiftTypeId: 'pm' }),
          assign('a', '2026-10-01'),
          assign('b', '2026-10-01'),
          assign('b', '2026-10-02'),
        ],
      }),
      filters,
    );
    expect(member(view, 'a').maxRun).toMatchObject({
      days: 2,
      from: '2026-09-30',
      to: '2026-10-01',
    });
    expect(member(view, 'b').maxRun.days).toBe(2);
    expect(view.maxRun.value).toBe(2);
    expect(view.maxRun.names.sort()).toEqual(['a', 'b']);
  });

  it('日曜→月曜は連勤だが別の週。週の勤務日数を月曜始まりで数える', () => {
    const view = buildBurden(
      analysis({
        assignments: [
          assign('a', '2026-10-10'),
          assign('a', '2026-10-11'),
          assign('a', '2026-10-12'),
        ],
      }),
      filters,
    );
    const a = member(view, 'a');
    expect(a.maxRun.days).toBe(3);
    expect(a.maxWeekRun).toMatchObject({
      weeks: 2,
      fromWeekStart: '2026-10-05',
      toWeekStart: '2026-10-12',
    });
    expect(a.weekCells.get('2026-10-05')?.days).toBe(2);
    expect(a.weekCells.get('2026-10-12')?.days).toBe(1);
  });

  it('勤務のない週で連続は途切れる（営業のない週もスキップしない）', () => {
    const view = buildBurden(
      analysis({
        assignments: [
          assign('a', '2026-10-06'),
          assign('a', '2026-10-13'),
          // 10/19 の週は勤務なし
          assign('a', '2026-10-27'),
        ],
        shifts: [shift('2026-10-06'), shift('2026-10-13'), shift('2026-10-27')],
      }),
      filters,
    );
    const a = member(view, 'a');
    expect(a.maxWeekRun).toMatchObject({ weeks: 2, fromWeekStart: '2026-10-05' });
    // 列は最初の週〜最後の週を連続して並べる
    expect(view.weeks).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('部門フィルタで他部門の勤務を数えず、下書きは除外できる', () => {
    const data = analysis({
      assignments: [
        assign('a', '2026-10-05', { departmentCode: 'ski' }),
        assign('a', '2026-10-12', { departmentCode: 'snowboard' }),
        assign('a', '2026-10-19', { departmentCode: 'ski', shiftStatus: 'DRAFT' }),
      ],
    });
    expect(member(buildBurden(data, filters), 'a').maxWeekRun.weeks).toBe(3);
    expect(member(buildBurden(data, { ...filters, department: 'ski' }), 'a').maxWeekRun.weeks).toBe(
      1,
    );
    expect(
      member(buildBurden(data, { ...filters, includeDrafts: false }), 'a').maxWeekRun.weeks,
    ).toBe(2);
  });

  it('予定を含む連勤・連続勤務週に印が付き、予定のみの週を判別でき、勤務のない人は除外する', () => {
    const view = buildBurden(
      analysis({
        assignments: [
          assign('a', '2026-11-09'),
          assign('a', '2026-11-10'),
          assign('a', '2026-11-11'),
          assign('b', '2026-11-16'),
          assign('c', '2026-10-01'),
        ],
      }),
      filters,
    );
    const a = member(view, 'a');
    expect(a.maxRun).toMatchObject({ days: 3, includesFuture: true });
    expect(a.maxWeekRun.includesFuture).toBe(true);
    // 11/9 は実施済みではなく today(11/10) より前 → 週内に実施済みも予定もある
    expect(a.weekCells.get('2026-11-09')).toMatchObject({ days: 3, plannedOnly: false });
    expect(member(view, 'b').weekCells.get('2026-11-16')?.plannedOnly).toBe(true);
    expect(member(view, 'c').maxRun.includesFuture).toBe(false);
    // d は配置なしで除外（a〜c は配置あり。qualified なしの d は対象外のため 0）
    expect(view.excludedCount).toBe(0);
  });

  it('メンバーは最大連続勤務週の降順→最大連勤→名前で並ぶ', () => {
    const view = buildBurden(
      analysis({
        assignments: [
          assign('a', '2026-10-05'),
          assign('b', '2026-10-05'),
          assign('b', '2026-10-12'),
          assign('c', '2026-10-05'),
          assign('c', '2026-10-06'),
        ],
      }),
      filters,
    );
    expect(view.members.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('直近の連続勤務週', () => {
  it('今シーズンは today より前の最新の営業週が基準で、そこから遡る連続週数を数える', () => {
    const data = analysis({
      shifts: [shift('2026-10-27'), shift('2026-11-03'), shift('2026-11-07'), shift('2026-11-14')],
      assignments: [
        assign('a', '2026-10-27'),
        assign('a', '2026-11-03'),
        assign('b', '2026-11-03'),
        assign('c', '2026-10-27'),
        // 予定の勤務は直近の判定に含めない
        assign('d', '2026-11-14'),
      ],
    });
    expect(resolveBaseWeek(data, filters)).toBe('2026-11-02');
    const view = buildBurden(data, filters);
    expect(member(view, 'a').recentWeekStreak).toBe(2);
    expect(member(view, 'b').recentWeekStreak).toBe(1);
    // 基準週に勤務がなければ 0
    expect(member(view, 'c').recentWeekStreak).toBe(0);
    expect(member(view, 'd').recentWeekStreak).toBe(0);
  });

  it('過去シーズンはシーズン内で最後に営業した週が基準になる', () => {
    const data = analysis({
      seasonRange: { from: '2025-09-01', to: '2026-08-31' },
      shifts: [shift('2026-05-30'), shift('2026-06-02')],
      assignments: [assign('a', '2026-05-30'), assign('a', '2026-06-02')],
    });
    expect(resolveBaseWeek(data, filters)).toBe('2026-06-01');
    expect(member(buildBurden(data, filters), 'a').recentWeekStreak).toBe(2);
  });

  it('基準日より前に営業日がなければ基準週は null で 0 週', () => {
    const data = analysis({
      shifts: [shift('2026-11-20')],
      assignments: [assign('a', '2026-11-20')],
    });
    expect(resolveBaseWeek(data, filters)).toBeNull();
    expect(member(buildBurden(data, filters), 'a').recentWeekStreak).toBe(0);
  });

  it('基準週の判定は部門フィルタ内の枠だけで行う', () => {
    const data = analysis({
      shifts: [shift('2026-11-03'), shift('2026-11-07', 'snowboard')],
    });
    expect(resolveBaseWeek(data, filters)).toBe('2026-11-02');
    expect(resolveBaseWeek(data, { ...filters, department: 'ski' })).toBe('2026-11-02');
    expect(
      resolveBaseWeek(analysis({ shifts: [shift('2026-10-20')] }), {
        ...filters,
        department: 'snowboard',
      }),
    ).toBeNull();
  });
});
