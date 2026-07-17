export type QualificationCompositionScore = {
  safetyRisk: number;
  diversityDeficit: number;
};

/**
 * 配置済みメンバーの実効資格レベルから、安全性とレベルの多様性を評価する。
 * tierRank は 1 が最上位で、値が大きいほど下位を表す。
 */
export function scoreQualificationComposition(
  assignedTierRanks: number[],
  configuredTierCount: number,
): QualificationCompositionScore {
  if (assignedTierRanks.length === 0) {
    return { safetyRisk: 0, diversityDeficit: 0 };
  }

  return {
    safetyRisk: Math.min(...assignedTierRanks) - 1,
    diversityDeficit:
      Math.min(assignedTierRanks.length, configuredTierCount) - new Set(assignedTierRanks).size,
  };
}
