import { describe, expect, it } from 'vitest';

import {
  compareCost,
  CRITERIA,
  PRIORITY,
  scorePlan,
  summarizePlan,
  type Criterion,
  type PlanSummary,
  type PriorityTier,
} from '../src/features/shifts/auto-assign/criteria';
import type { AssignmentFrame, PlanBasis } from '../src/features/shifts/auto-assign/problem';

const DAY_ZERO = Date.parse('2027-01-01T00:00:00Z') / 86_400_000;

/** 2027年1月の日（1始まり）から対象枠を作る。 */
function frame(dayOfMonth: number, selected: string[]): AssignmentFrame {
  return {
    date: `2027-01-${String(dayOfMonth).padStart(2, '0')}`,
    day: DAY_ZERO + dayOfMonth - 1,
    required: selected.length,
    candidates: new Set(selected),
    selected,
  };
}

/** 保存済みの勤務日（1月の日）と申告から集計の前提を作る。 */
function basis(overrides: {
  worked?: Record<string, number[]>;
  avoid?: string[];
  ranks?: Record<string, number>;
  configuredRankCount?: number;
}): PlanBasis {
  const ranks = overrides.ranks ?? {};
  const worked = overrides.worked ?? {};
  const ids = new Set([...Object.keys(ranks), ...Object.keys(worked)]);
  return {
    baseline: new Map(
      [...ids].map((id) => [
        id,
        new Set((worked[id] ?? []).map((dayOfMonth) => DAY_ZERO + dayOfMonth - 1)),
      ]),
    ),
    avoid: new Set(overrides.avoid),
    rankById: new Map(Object.entries(ranks)),
    configuredRankCount: overrides.configuredRankCount ?? 3,
  };
}

function summary(overrides: Partial<PlanSummary>): PlanSummary {
  return { instructors: [], frames: [], configuredRankCount: 3, ...overrides };
}

function load(instructorId: string, workDays: number, streakExcess = 0, avoidDays = 0) {
  return { instructorId, workDays, streakExcess, avoidDays };
}

describe('summarizePlan', () => {
  it('保存済みの勤務と提案中の勤務を合わせ、同じ日は1日として数える', () => {
    const result = summarizePlan(
      [frame(5, ['a']), frame(8, ['a', 'b'])],
      basis({ worked: { a: [5, 10], b: [] }, ranks: { a: 1, b: 3 } }),
    );
    expect(result.instructors).toEqual([load('a', 3), load('b', 1)]);
  });

  it('提案に入らなかった人も保存済みの勤務日数で集計に残す', () => {
    const result = summarizePlan(
      [frame(5, ['a'])],
      basis({ worked: { b: [1, 3] }, ranks: { a: 1, b: 2 } }),
    );
    expect(result.instructors).toEqual([load('a', 1), load('b', 2)]);
  });

  it.each([
    { worked: [2, 3], proposed: 4, expected: 0, title: '3連勤は超過0' },
    { worked: [2, 3, 4], proposed: 5, expected: 1, title: '4連勤は超過1' },
    { worked: [2, 3, 5, 6], proposed: 4, expected: 2, title: '前後をつないだ5連勤は超過2' },
    { worked: [1, 2, 3, 4, 10, 11, 12], proposed: 13, expected: 2, title: '連勤ごとに合計する' },
    { worked: [2, 3, 4], proposed: 6, expected: 0, title: '1日空けば連勤は切れる' },
  ])('$title', ({ worked, proposed, expected }) => {
    const result = summarizePlan(
      [frame(proposed, ['a'])],
      basis({ worked: { a: worked }, ranks: { a: 1 } }),
    );
    expect(result.instructors[0]?.streakExcess).toBe(expected);
  });

  it('要調整の日に提案で入った日数だけを数える', () => {
    const result = summarizePlan(
      [frame(5, ['a', 'b']), frame(6, ['a']), frame(7, ['a'])],
      basis({
        ranks: { a: 1, b: 2 },
        // 1/8 は提案に入っていないので数えない。
        avoid: ['2027-01-05:a', '2027-01-07:a', '2027-01-08:a', '2027-01-06:b'],
      }),
    );
    expect(result.instructors.map(({ avoidDays }) => avoidDays)).toEqual([2, 0]);
  });

  it('枠ごとに配置者の資格ランクを返す', () => {
    const result = summarizePlan(
      [frame(5, ['a', 'c']), frame(6, [])],
      basis({ ranks: { a: 1, c: 3 }, configuredRankCount: 3 }),
    );
    expect(result.frames).toEqual([
      { date: '2027-01-05', ranks: [1, 3] },
      { date: '2027-01-06', ranks: [] },
    ]);
    expect(result.configuredRankCount).toBe(3);
  });
});

describe('CRITERIA', () => {
  const sample = summary({
    instructors: [load('a', 3, 2, 1), load('b', 5, 1, 2)],
    frames: [
      { date: '2027-01-05', ranks: [2, 2] },
      { date: '2027-01-06', ranks: [1, 3] },
      { date: '2027-01-07', ranks: [] },
    ],
  });

  it.each<[Criterion, number]>([
    ['avoidAssignments', 3],
    ['consecutiveExcess', 3],
    // 3² + 5²
    ['workDayImbalance', 34],
    // 1枠目は最上位がランク2なので1。2枠目はランク1がいるので0。
    ['rankRisk', 1],
    // 1枠目は2名とも同じランクなので1。2枠目は混在しているので0。
    ['rankDeficit', 1],
  ])('%s を集計から求める', (criterion, expected) => {
    expect(CRITERIA[criterion](sample)).toBe(expected);
  });

  it('勤務日数の偏りは、合計が同じなら日数が揃うほど小さくなる', () => {
    const even = summary({ instructors: [load('a', 5), load('b', 5)] });
    const uneven = summary({ instructors: [load('a', 4), load('b', 6)] });
    expect(CRITERIA.workDayImbalance(even)).toBeLessThan(CRITERIA.workDayImbalance(uneven));
  });
});

describe('PRIORITY', () => {
  // 優先順位を変えたら、docs/design/auto-assignment-rules.md と合わせてここも更新する。
  it('要調整・連勤・勤務日数・上位ランク・ランク混在の順で、重みなしの順位固定である', () => {
    expect(PRIORITY).toEqual([
      [{ criterion: 'avoidAssignments', weight: 1 }],
      [{ criterion: 'consecutiveExcess', weight: 1 }],
      [{ criterion: 'workDayImbalance', weight: 1 }],
      [{ criterion: 'rankRisk', weight: 1 }],
      [{ criterion: 'rankDeficit', weight: 1 }],
    ]);
  });

  it('定義した基準をどれも漏らさず、重複なく使う', () => {
    const used = PRIORITY.flatMap((tier) => tier.map(({ criterion }) => criterion));
    expect([...used].sort()).toEqual(Object.keys(CRITERIA).sort());
  });
});

describe('scorePlan / compareCost', () => {
  it('前の段で勝る案は、後ろの段がどれだけ悪くても勝つ', () => {
    const noAvoid = summary({
      instructors: [load('a', 30, 9, 0), load('b', 0)],
      frames: [{ date: '2027-01-05', ranks: [3, 3] }],
    });
    const oneAvoid = summary({
      instructors: [load('a', 15, 0, 1), load('b', 15)],
      frames: [{ date: '2027-01-05', ranks: [1, 2] }],
    });
    expect(compareCost(scorePlan(noAvoid), scorePlan(oneAvoid))).toBeLessThan(0);
  });

  it('前の段が同じときだけ、次の段で比べる', () => {
    const better = summary({ instructors: [load('a', 5), load('b', 5)] });
    const worse = summary({ instructors: [load('a', 4), load('b', 6)] });
    expect(compareCost(scorePlan(better), scorePlan(worse))).toBeLessThan(0);
    expect(compareCost(scorePlan(worse), scorePlan(better))).toBeGreaterThan(0);
    expect(compareCost(scorePlan(better), scorePlan(better))).toBe(0);
  });

  it('同じ段の基準は重みを掛けて合算する', () => {
    const sample = summary({ instructors: [load('a', 3, 2, 1)] });
    const priority: PriorityTier[] = [
      [
        { criterion: 'avoidAssignments', weight: 10 },
        { criterion: 'workDayImbalance', weight: 1 },
      ],
      [{ criterion: 'consecutiveExcess', weight: 3 }],
    ];
    expect(scorePlan(sample, priority)).toEqual([10 * 1 + 9, 3 * 2]);
  });

  // 要調整と勤務日数を同じ段に置くと「何日差で逆転するか」を重みで表せる。
  // 重み 2N なら、勤務可能な人より累計が N 日を超えて少ないときだけ要調整の人を選ぶ。
  it.each([
    { gap: 10, expected: '勤務可能な人' },
    { gap: 11, expected: '要調整の人' },
  ])('重み20で累計が$gap日少ない要調整の人と比べると$expectedを選ぶ', ({ gap, expected }) => {
    const priority: PriorityTier[] = [
      [
        { criterion: 'avoidAssignments', weight: 20 },
        { criterion: 'workDayImbalance', weight: 1 },
      ],
    ];
    const avoidDays = 2;
    const availableDays = avoidDays + gap;
    const pickAvoid = summary({
      instructors: [load('avoid', avoidDays + 1, 0, 1), load('available', availableDays)],
    });
    const pickAvailable = summary({
      instructors: [load('avoid', avoidDays), load('available', availableDays + 1)],
    });
    const difference = compareCost(
      scorePlan(pickAvoid, priority),
      scorePlan(pickAvailable, priority),
    );
    expect(difference < 0 ? '要調整の人' : '勤務可能な人').toBe(expected);
  });
});
