import { describe, expect, it } from 'vitest';

import {
  evaluateFrameComposition,
  scoreQualificationComposition,
  type CompositionTier,
} from '../src/features/shifts/qualification-composition';

describe('scoreQualificationComposition', () => {
  it.each([
    { tiers: [1, 2, 3], expected: { safetyRisk: 0, diversityDeficit: 0 } },
    { tiers: [1, 1, 3], expected: { safetyRisk: 0, diversityDeficit: 1 } },
    { tiers: [1, 3, 3], expected: { safetyRisk: 0, diversityDeficit: 1 } },
    { tiers: [2, 3, 3], expected: { safetyRisk: 1, diversityDeficit: 1 } },
    { tiers: [3, 3, 3], expected: { safetyRisk: 2, diversityDeficit: 2 } },
  ])('3レベル構成の $tiers を安全性と多様性で評価する', ({ tiers, expected }) => {
    expect(scoreQualificationComposition(tiers, 3)).toEqual(expected);
  });

  it('2レベル構成では配置人数を超える多様性を求めない', () => {
    expect(scoreQualificationComposition([1, 1], 2)).toEqual({
      safetyRisk: 0,
      diversityDeficit: 1,
    });
  });

  it('5レベル構成でも配置人数と同数の異なるレベルがあれば理想とする', () => {
    expect(scoreQualificationComposition([1, 3, 5], 5)).toEqual({
      safetyRisk: 0,
      diversityDeficit: 0,
    });
  });
});

describe('evaluateFrameComposition', () => {
  const three: CompositionTier[] = [
    { certificationId: 'inst', tierRank: 1, shortName: '指導員' },
    { certificationId: 'semi', tierRank: 2, shortName: '準指導員' },
    { certificationId: 'cert', tierRank: 3, shortName: '認定指導員' },
  ];
  const person = (id: string, ...certificationIds: string[]) => ({
    id,
    name: `名${id}`,
    certificationIds,
  });
  const evaluate = (
    assigned: ReturnType<typeof person>[],
    tiers: CompositionTier[] = three,
    eligible: string[] = assigned.map((p) => p.id),
  ) => evaluateFrameComposition({ assigned, tiers, eligibleInstructorIds: new Set(eligible) });

  it('複数資格の人は最上位ランクだけで数え、重複カウントしない', () => {
    const result = evaluate([person('a', 'cert', 'inst'), person('b', 'cert')]);
    expect(result.rankBreakdown.map((r) => [r.tierRank, r.count, r.names])).toEqual([
      [1, 1, ['名a']],
      [2, 0, []],
      [3, 1, ['名b']],
    ]);
    expect(result.qualifiedCount).toBe(2);
    expect(result.needsReview).toBe(false);
  });

  it('必要資格が未設定ならrequirementUnsetで、理由は出さない', () => {
    const result = evaluate([person('a', 'x')], []);
    expect(result.requirementUnset).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.needsReview).toBe(false);
  });

  it('資格を満たさない配置者を資格要件外として理由に出す', () => {
    const result = evaluate([person('a', 'inst'), person('b', 'cert')], three, ['a']);
    expect(result.outOfRequirementNames).toEqual(['名b']);
    expect(result.reasons).toEqual(['資格要件外の配置: 名b']);
    expect(result.qualifiedCount).toBe(1);
    expect(result.assignedCount).toBe(2);
  });

  it('3段階で最下位だけなら要確認', () => {
    const result = evaluate([person('a', 'cert'), person('b', 'cert')]);
    expect(result.reasons).toEqual(['認定指導員のみの構成']);
    expect(result.needsReview).toBe(true);
  });

  it('上位が混在していれば要確認にならない', () => {
    expect(evaluate([person('a', 'semi'), person('b', 'cert')]).needsReview).toBe(false);
  });

  it('2段階で最下位だけなら要確認', () => {
    const two = three.slice(1);
    expect(evaluate([person('a', 'cert')], two).reasons).toEqual(['認定指導員のみの構成']);
  });

  it('同ランクに複数資格があれば最下位の資格名を・で連ねる', () => {
    const tiers: CompositionTier[] = [
      ...three.slice(0, 2),
      { certificationId: 'cert2', tierRank: 3, shortName: '特別認定' },
      three[2]!,
    ];
    expect(evaluate([person('a', 'cert2')], tiers).reasons).toEqual([
      '特別認定・認定指導員のみの構成',
    ]);
  });

  it('1段階だけの枠は要確認にならない', () => {
    expect(evaluate([person('a', 'cert')], [three[2]!]).needsReview).toBe(false);
  });

  it('配置0名なら要確認にならない', () => {
    const result = evaluate([]);
    expect(result.needsReview).toBe(false);
    expect(result.assignedCount).toBe(0);
  });
});
