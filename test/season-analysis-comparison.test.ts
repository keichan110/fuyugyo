import { describe, expect, it } from 'vitest';

import {
  buildComparison,
  resolveComparisonPeriod,
  summarizeComparison,
} from '../src/features/season-analysis/comparison';
import { analysis, assign, filters } from './season-analysis-fixtures';

/** 前シーズン比較(F)の集計純粋関数の単体テスト。基準日は 2026-11-10。 */

describe('resolveComparisonPeriod', () => {
  it('進行中シーズンは基準日前日まで、前シーズンは1年ずらす。過去シーズンは全期間', () => {
    expect(resolveComparisonPeriod(analysis())).toEqual({
      mode: 'toDate',
      current: { from: '2026-09-01', to: '2026-11-09' },
      previous: { from: '2025-09-01', to: '2025-11-09' },
    });
    const past = resolveComparisonPeriod(
      analysis({ seasonRange: { from: '2025-09-01', to: '2026-08-31' } }),
    );
    expect(past).toEqual({
      mode: 'fullSeason',
      current: { from: '2025-09-01', to: '2026-08-31' },
      previous: { from: '2024-09-01', to: '2025-08-31' },
    });
  });
});

describe('buildComparison', () => {
  const previous = analysis({
    seasonRange: { from: '2025-09-01', to: '2026-08-31' },
    assignments: [
      assign('a', '2025-10-01'),
      assign('a', '2025-10-02'),
      assign('a', '2025-11-09'),
      // 比較期間（〜11/9）外
      assign('a', '2025-11-10'),
      assign('c', '2025-10-05'),
    ],
  });

  it('メンバー別は比較期間内の実施済みだけで比べ、月別の前シーズンは全期間を出す', () => {
    const current = analysis({
      assignments: [
        assign('a', '2026-10-01'),
        assign('b', '2026-10-02'),
        assign('b', '2026-10-03'),
        // 予定（基準日以降）は比較に含めず別系列
        assign('b', '2026-11-12'),
      ],
    });
    const view = buildComparison(current, previous, filters);
    expect(view.months).toEqual([
      { month: 10, current: 3, previous: 3, currentPlanned: 0 },
      // 前シーズンの 11/10 は比較期間外だが、月別では全期間を数える
      { month: 11, current: 0, previous: 2, currentPlanned: 1 },
    ]);
    const byId = new Map(view.members.map((m) => [m.id, m]));
    expect(byId.get('a')).toMatchObject({ current: 1, previous: 3, diff: -2, isNew: false });
    expect(byId.get('b')).toMatchObject({ current: 2, previous: 0, diff: 2, isNew: true });
    // 今シーズンに配置がない人も表示される
    expect(byId.get('c')).toMatchObject({ current: 0, previous: 1, diff: -1, isNew: false });
    expect(view.members[0]?.id).toBe('b');
    expect(view.previousIsEmpty).toBe(false);
  });

  it('前シーズンが空・未取得なら previousIsEmpty になる', () => {
    const current = analysis({ assignments: [assign('a', '2026-10-01')] });
    expect(buildComparison(current, undefined, filters).previousIsEmpty).toBe(true);
    expect(buildComparison(current, analysis(), filters).previousIsEmpty).toBe(true);
  });
});

describe('summarizeComparison', () => {
  it('比較期間内の延べ日数と増減率、増減の大きい人を返す', () => {
    const current = analysis({
      assignments: [
        assign('a', '2026-10-01'),
        ...['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => assign('b', d)),
      ],
    });
    const previous = analysis({
      seasonRange: { from: '2025-09-01', to: '2026-08-31' },
      assignments: [
        ...['2025-10-01', '2025-10-02', '2025-10-03'].map((d) => assign('a', d)),
        assign('c', '2025-10-05'),
      ],
    });
    const summary = summarizeComparison(buildComparison(current, previous, filters));
    expect(summary).toMatchObject({ currentTotal: 4, previousTotal: 4, diff: 0, diffPercent: 0 });
    expect(summary.topIncreases.map((m) => [m.id, m.diff])).toEqual([['b', 3]]);
    expect(summary.topDecreases.map((m) => [m.id, m.diff])).toEqual([
      ['a', -2],
      ['c', -1],
    ]);
  });

  it('前シーズンが0日なら増減率は null', () => {
    const current = analysis({ assignments: [assign('a', '2026-10-01')] });
    const summary = summarizeComparison(buildComparison(current, analysis(), filters));
    expect(summary.diffPercent).toBeNull();
  });
});
