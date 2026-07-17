import { describe, expect, it } from 'vitest';

import { scoreQualificationComposition } from '../src/features/shifts/qualification-composition';

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
