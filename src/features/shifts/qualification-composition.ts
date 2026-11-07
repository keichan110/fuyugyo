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

/** 枠に紐づく必要資格。tierRank は 1 が最上位。 */
export type CompositionTier = { certificationId: string; tierRank: number; shortName: string };

/** ランクごとの配置内訳。 */
export type RankBreakdown = {
  tierRank: number;
  certificationNames: string[];
  count: number;
  names: string[];
};

/** 1枠の資格構成の評価結果。 */
export type FrameComposition = {
  /** 枠に必要資格が設定されていない */
  requirementUnset: boolean;
  /** ランクごと（上位から）の内訳。各人は最上位ランク1つだけに数える */
  rankBreakdown: RankBreakdown[];
  /** 必要資格を満たす配置人数 */
  qualifiedCount: number;
  /** 配置人数 */
  assignedCount: number;
  /** 資格要件外の配置者名 */
  outOfRequirementNames: string[];
  /** 要確認の理由。必要資格未設定は含めない */
  reasons: string[];
  needsReview: boolean;
};

/**
 * 配置者のランクから「最下位ランクのみの構成」の要確認理由を返す。
 * 枠に異なるランクが2段階以上あり、配置者が1人以上いて全員が最下位のときだけ理由を返す。
 * 自動割当と画面表示で同じ判定を使う。
 */
export function lowestRankOnlyReason(
  assignedRanks: readonly number[],
  tiers: readonly CompositionTier[],
): string | null {
  const ranks = [...new Set(tiers.map((tier) => tier.tierRank))];
  if (ranks.length < 2 || assignedRanks.length === 0) return null;
  const lowest = Math.max(...ranks);
  if (!assignedRanks.every((rank) => rank === lowest)) return null;
  const names = [
    ...new Set(tiers.filter((tier) => tier.tierRank === lowest).map((tier) => tier.shortName)),
  ];
  return `${names.join('・')}のみの構成`;
}

/**
 * 配置者の資格構成を枠の必要資格に照らして評価する。
 * 複数資格の人は枠に紐づく資格のうち最上位ランクで数える。
 */
export function evaluateFrameComposition(input: {
  assigned: readonly { id: string; name: string; certificationIds: readonly string[] }[];
  tiers: readonly CompositionTier[];
  eligibleInstructorIds: ReadonlySet<string>;
}): FrameComposition {
  const { assigned, tiers, eligibleInstructorIds } = input;
  const rankByCertification = new Map(tiers.map((tier) => [tier.certificationId, tier.tierRank]));
  const ranks = [...new Set(tiers.map((tier) => tier.tierRank))].sort((a, b) => a - b);
  const rankBreakdown: RankBreakdown[] = ranks.map((tierRank) => ({
    tierRank,
    certificationNames: tiers.filter((tier) => tier.tierRank === tierRank).map((t) => t.shortName),
    count: 0,
    names: [],
  }));
  const outOfRequirementNames: string[] = [];
  const qualifiedRanks: number[] = [];
  if (tiers.length > 0) {
    for (const person of assigned) {
      const rank = Math.min(
        ...person.certificationIds.map((id) => rankByCertification.get(id) ?? Infinity),
      );
      const entry = rankBreakdown.find((item) => item.tierRank === rank);
      if (!eligibleInstructorIds.has(person.id) || !entry) {
        outOfRequirementNames.push(person.name);
        continue;
      }
      entry.count += 1;
      entry.names.push(person.name);
      qualifiedRanks.push(rank);
    }
  }
  const reasons: string[] = [];
  if (outOfRequirementNames.length > 0) {
    reasons.push(`資格要件外の配置: ${outOfRequirementNames.join('、')}`);
  }
  const composition = lowestRankOnlyReason(qualifiedRanks, tiers);
  if (composition) reasons.push(composition);
  return {
    requirementUnset: tiers.length === 0,
    rankBreakdown,
    qualifiedCount: qualifiedRanks.length,
    assignedCount: assigned.length,
    outOfRequirementNames,
    reasons,
    needsReview: reasons.length > 0,
  };
}
