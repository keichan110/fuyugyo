/**
 * 資格段を上位から欠番のない1始まりの連番へ正規化する。
 * 同じ段に属する要素は同着のまま維持する。
 */
export function normalizeTierRanks<T extends { tierRank: number }>(items: T[]): T[] {
  const tierRanks = [...new Set(items.map(({ tierRank }) => tierRank))].sort((a, b) => a - b);
  const normalizedTierRankByRank = new Map(
    tierRanks.map((tierRank, index) => [tierRank, index + 1]),
  );

  return items.map((item) => ({
    ...item,
    tierRank: normalizedTierRankByRank.get(item.tierRank) ?? item.tierRank,
  }));
}
