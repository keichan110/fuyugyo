import { describe, expect, it } from 'vitest';

import { buildConsecutive, splitIntoRuns } from '../src/features/season-analysis/consecutive';
import { analysis, assign, filters } from './season-analysis-fixtures';

/** 連勤(C)の集計純粋関数の単体テスト。基準日は 2026-11-10。 */

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

describe('buildConsecutive', () => {
  it('4連勤以上のみを一覧に出し、3連勤は含めない（境界）', () => {
    const view = buildConsecutive(
      analysis({
        assignments: [
          ...['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => assign('a', d)),
          ...['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => assign('b', d)),
        ],
      }),
      filters,
    );
    expect(view.members.map((m) => [m.id, m.maxStreak, m.longRunCount])).toEqual([
      ['b', 4, 1],
      ['a', 3, 0],
    ]);
    expect(view.longRuns).toHaveLength(1);
    expect(view.longRuns[0]).toMatchObject({ instructorId: 'b', days: 4, from: '2026-10-01' });
  });

  it('同日複数勤務は1日、月またぎと実施済み/予定をまたぐ連勤を判定する', () => {
    const view = buildConsecutive(
      analysis({
        assignments: [
          assign('a', '2026-11-07', { shiftTypeId: 'am' }),
          assign('a', '2026-11-07', { shiftTypeId: 'pm' }),
          assign('a', '2026-11-08'),
          assign('a', '2026-11-09'),
          assign('a', '2026-11-10'),
        ],
      }),
      filters,
    );
    expect(view.members[0]).toMatchObject({ maxStreak: 4, longRunCount: 1 });
    expect(view.longRuns[0]).toMatchObject({ days: 4, includesPast: true, includesFuture: true });

    const crossMonth = buildConsecutive(
      analysis({
        assignments: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) =>
          assign('a', d),
        ),
      }),
      filters,
    );
    expect(crossMonth.longRuns[0]).toMatchObject({ from: '2026-09-29', to: '2026-10-02' });
    expect(crossMonth.longRuns[0]).toMatchObject({ includesPast: true, includesFuture: false });
  });

  it('部門をまたぐ連勤は全体で数え、部門を絞ると他部門の日で途切れる。下書きは除外できる', () => {
    const data = analysis({
      assignments: [
        assign('a', '2026-10-01', { departmentCode: 'ski' }),
        assign('a', '2026-10-02', { departmentCode: 'snowboard' }),
        assign('a', '2026-10-03', { departmentCode: 'ski' }),
        assign('a', '2026-10-04', { departmentCode: 'ski', shiftStatus: 'DRAFT' }),
      ],
    });
    expect(buildConsecutive(data, filters).members[0]?.maxStreak).toBe(4);
    expect(buildConsecutive(data, { ...filters, department: 'ski' }).members[0]?.maxStreak).toBe(2); // 10/1 と、10/3〜10/4（snowboard の 10/2 で途切れる）
    expect(buildConsecutive(data, { ...filters, includeDrafts: false }).members[0]?.maxStreak).toBe(
      3,
    );
  });
});
