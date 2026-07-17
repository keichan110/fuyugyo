import type { CertificationRequirement } from './schema';

export type TierBlock = {
  id: string;
  certificationIds: string[];
  preserveWhenEmpty: boolean;
};

/** 保存済みの資格要件を、画面編集用の段ブロックへ変換する。 */
export function createTierBlocks(requirements: CertificationRequirement[]): TierBlock[] {
  const sortedRanks = [...new Set(requirements.map(({ tierRank }) => tierRank))].sort(
    (left, right) => left - right,
  );
  return sortedRanks.map((tierRank) => ({
    id: `saved-tier-${tierRank}`,
    certificationIds: requirements
      .filter((requirement) => requirement.tierRank === tierRank)
      .map(({ certificationId }) => certificationId),
    preserveWhenEmpty: false,
  }));
}

/** 資格を最下段へ追加する。段がなければ最初の段を作成する。 */
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

/** 資格をドロップできる空の最下段を追加する。 */
export function addEmptyTier(blocks: TierBlock[], blockId: string): TierBlock[] {
  return [...blocks, { id: blockId, certificationIds: [], preserveWhenEmpty: true }];
}

/** ユーザーが追加した空段を取り消す。資格を含む段は削除しない。 */
export function removeEmptyTier(blocks: TierBlock[], blockId: string): TierBlock[] {
  const target = blocks.find((block) => block.id === blockId);
  if (!target || target.certificationIds.length > 0) return blocks;
  return blocks.filter((block) => block.id !== blockId);
}

/** 資格を対象から除外し、通常の空段を取り除く。 */
export function removeCertification(blocks: TierBlock[], certificationId: string): TierBlock[] {
  return cleanEmptyTiers(
    blocks.map((block) => ({
      ...block,
      certificationIds: block.certificationIds.filter((id) => id !== certificationId),
    })),
  );
}

/** 資格を指定した段・位置へ挿入し、移動元に残った通常の空段を取り除く。 */
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

/** 画面上の順序を、欠番のない資格要件として保存形式へ変換する。 */
export function serializeTierBlocks(blocks: TierBlock[]): CertificationRequirement[] {
  return blocks
    .filter((block) => block.certificationIds.length > 0)
    .flatMap((block, index) =>
      block.certificationIds.map((certificationId) => ({
        certificationId,
        tierRank: index + 1,
      })),
    );
}

function cleanEmptyTiers(blocks: TierBlock[]): TierBlock[] {
  return blocks.filter((block) => block.certificationIds.length > 0 || block.preserveWhenEmpty);
}
