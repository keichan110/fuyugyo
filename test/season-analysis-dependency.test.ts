import { describe, expect, it } from 'vitest';

import { buildDependency } from '../src/features/season-analysis/dependency';
import type { SeasonAnalysis } from '../src/features/season-analysis/schema';
import { analysis, assign, filters } from './season-analysis-fixtures';

/** 特定の人への依存(E)の集計純粋関数の単体テスト。基準日は 2026-11-10。 */

describe('buildDependency', () => {
  const tierDefinitions: SeasonAnalysis['tierDefinitions'] = [
    { departmentCode: 'ski', shiftTypeId: 'am', tierRank: 1, certificationShortName: '指導員' },
    { departmentCode: 'ski', shiftTypeId: 'am', tierRank: 2, certificationShortName: '準指導員' },
    { departmentCode: 'ski', shiftTypeId: 'pm', tierRank: 1, certificationShortName: '検定員' },
  ];

  it('ランク別に担当人数・上位3名の占有率を出し、null ランクはランク外にまとめる', () => {
    const [ski] = buildDependency(
      analysis({
        tierDefinitions,
        assignments: [
          assign('a', '2026-10-01', { tierRank: 1 }),
          assign('a', '2026-10-02', { tierRank: 1 }),
          assign('a', '2026-10-03', { tierRank: 1 }),
          assign('b', '2026-10-01', { tierRank: 1 }),
          assign('c', '2026-10-01', { tierRank: 1 }),
          assign('d', '2026-10-01', { tierRank: 1 }),
          assign('a', '2026-10-04', { tierRank: null }),
        ],
      }),
      { ...filters, department: 'ski' },
    );
    expect(ski?.hasTiers).toBe(true);
    const rank1 = ski?.ranks.find((r) => r.tierRank === 1);
    expect(rank1).toMatchObject({ label: '指導員・検定員', assignmentCount: 6, memberCount: 4 });
    // 上位3名 = a(3)+b(1)+c(1) = 5 / 6
    expect(rank1?.topShare).toBeCloseTo(5 / 6);
    expect(rank1?.members[0]).toMatchObject({ id: 'a', count: 3, share: 0.5 });
    // 配置のない定義済みランクも 0 件で残る
    expect(ski?.ranks.find((r) => r.tierRank === 2)).toMatchObject({
      assignmentCount: 0,
      topShare: null,
    });
    expect(ski?.ranks.find((r) => r.tierRank === null)).toMatchObject({
      label: 'ランク外',
      assignmentCount: 1,
    });
    // ランク外は最後
    expect(ski?.ranks[ski.ranks.length - 1]?.tierRank).toBeNull();
  });

  it('枠単位で数え（同日複数枠は複数回）、下書き除外・全体では部門ごとに分ける', () => {
    const data = analysis({
      tierDefinitions,
      assignments: [
        assign('a', '2026-10-01', { shiftTypeId: 'am', tierRank: 1 }),
        assign('a', '2026-10-01', { shiftTypeId: 'pm', tierRank: 1 }),
        assign('b', '2026-10-02', { tierRank: 1, shiftStatus: 'DRAFT' }),
        assign('c', '2026-10-02', { departmentCode: 'snowboard' }),
      ],
    });
    const all = buildDependency(data, filters);
    expect(all.map((d) => d.departmentCode)).toEqual(['ski', 'snowboard']);
    expect(all[0]?.members.find((m) => m.id === 'a')?.count).toBe(2);
    expect(all[0]?.assignmentCount).toBe(3);
    const published = buildDependency(data, { ...filters, includeDrafts: false });
    expect(published[0]?.assignmentCount).toBe(2);
    // ランク定義のない部門
    expect(all[1]?.hasTiers).toBe(false);
  });
});
