import type { CertificationRequirement } from './schema';

export type TierBlock = {
  id: string;
  certificationIds: string[];
  preserveWhenEmpty: boolean;
};

/** 保存済みの資格要件を、画面編集用のレベルブロックへ変換する。 */
export function createTierBlocks(requirements: CertificationRequirement[]): TierBlock[] {
  const certificationIdsByRank = new Map<number, string[]>();
  for (const { tierRank, certificationId } of requirements) {
    const certificationIds = certificationIdsByRank.get(tierRank);
    if (certificationIds) {
      certificationIds.push(certificationId);
    } else {
      certificationIdsByRank.set(tierRank, [certificationId]);
    }
  }
  const sortedRanks = [...certificationIdsByRank.keys()].sort((left, right) => left - right);
  return sortedRanks.map((tierRank) => ({
    id: `saved-tier-${tierRank}`,
    certificationIds: certificationIdsByRank.get(tierRank) ?? [],
    preserveWhenEmpty: false,
  }));
}

/** 資格を最下位レベルへ追加する。レベルがなければ最初のレベルを作成する。 */
export function addCertification(
  blocks: TierBlock[],
  certificationId: string,
  blockId: string,
): TierBlock[] {
  if (blocks.some((block) => block.certificationIds.includes(certificationId))) return blocks;
  if (blocks.length === 0) {
    return [{ id: blockId, certificationIds: [certificationId], preserveWhenEmpty: false }];
  }
  return blocks.map((block, index) =>
    index === blocks.length - 1
      ? {
          ...block,
          certificationIds: [...block.certificationIds, certificationId],
          preserveWhenEmpty: false,
        }
      : block,
  );
}

/** 資格をドロップできる空の最下位レベルを追加する。 */
export function addEmptyTier(blocks: TierBlock[], blockId: string): TierBlock[] {
  return [...blocks, { id: blockId, certificationIds: [], preserveWhenEmpty: true }];
}

/** ユーザーが追加した空レベルを取り消す。資格を含むレベルは削除しない。 */
export function removeEmptyTier(blocks: TierBlock[], blockId: string): TierBlock[] {
  const target = blocks.find((block) => block.id === blockId);
  if (!target || target.certificationIds.length > 0) return blocks;
  return blocks.filter((block) => block.id !== blockId);
}

/** 資格を対象から除外し、通常の空レベルを取り除く。 */
export function removeCertification(blocks: TierBlock[], certificationId: string): TierBlock[] {
  return cleanEmptyTiers(
    blocks.map((block) => ({
      ...block,
      certificationIds: block.certificationIds.filter((id) => id !== certificationId),
    })),
  );
}

/** 資格を指定したレベル・位置へ挿入し、移動元に残った通常の空レベルを取り除く。 */
export function moveCertification(
  blocks: TierBlock[],
  certificationId: string,
  destinationTierId: string,
  destinationIndex: number,
): TierBlock[] {
  if (!blocks.some((block) => block.certificationIds.includes(certificationId))) return blocks;
  const withoutSource = blocks.map((block) => ({
    ...block,
    certificationIds: block.certificationIds.filter((id) => id !== certificationId),
  }));
  const destination = withoutSource.find((block) => block.id === destinationTierId);
  if (!destination) return blocks;

  const boundedIndex = Math.max(0, Math.min(destinationIndex, destination.certificationIds.length));
  const moved = withoutSource.map((block) => {
    if (block.id !== destinationTierId) return block;
    const certificationIds = [...block.certificationIds];
    certificationIds.splice(boundedIndex, 0, certificationId);
    return { ...block, certificationIds, preserveWhenEmpty: false };
  });
  return cleanEmptyTiers(moved);
}

/** 画面上のレベル順を、欠番のない資格要件として保存形式へ変換する。 */
export function serializeTierBlocks(blocks: TierBlock[]): CertificationRequirement[] {
  const requirements: CertificationRequirement[] = [];
  let tierRank = 0;
  for (const block of blocks) {
    if (block.certificationIds.length === 0) continue;
    tierRank += 1;
    for (const certificationId of block.certificationIds) {
      requirements.push({ certificationId, tierRank });
    }
  }
  return requirements;
}

/** 保存済み要件と編集中要件を比較し、追加・除外・レベル変更された資格数を返す。 */
export function countChangedRequirements(
  saved: CertificationRequirement[],
  current: CertificationRequirement[],
): number {
  const savedRankByCertificationId = new Map(
    saved.map(({ certificationId, tierRank }) => [certificationId, tierRank]),
  );
  const currentRankByCertificationId = new Map(
    current.map(({ certificationId, tierRank }) => [certificationId, tierRank]),
  );
  const certificationIds = new Set([
    ...savedRankByCertificationId.keys(),
    ...currentRankByCertificationId.keys(),
  ]);

  return [...certificationIds].filter(
    (certificationId) =>
      savedRankByCertificationId.get(certificationId) !==
      currentRankByCertificationId.get(certificationId),
  ).length;
}

function cleanEmptyTiers(blocks: TierBlock[]): TierBlock[] {
  return blocks.filter((block) => block.certificationIds.length > 0 || block.preserveWhenEmpty);
}
