/** 割り当て候補に表示する、勤務種別に該当する資格。 */
export type RelevantCertification = {
  shortName: string;
  tierRank: number;
};

/** 資格順に並べる候補が持つ最小限の情報。 */
export type CertificationSortableCandidate = {
  displayName: string;
  displayNameKana: string | null;
  certifications: RelevantCertification[];
};

/**
 * 候補の該当資格のうち最上位のランクを返す。
 * ランク値が小さいほど上位であり、該当資格を持たない候補は末尾へ並べる。
 */
export function bestCertificationTier(candidate: CertificationSortableCandidate): number {
  return candidate.certifications.reduce(
    (best, certification) => Math.min(best, certification.tierRank),
    Number.POSITIVE_INFINITY,
  );
}

/** 資格ランクの昇順（上位から）、同ランク内はかな順で候補を比較する。 */
export function compareInstructorCertification(
  a: CertificationSortableCandidate,
  b: CertificationSortableCandidate,
): number {
  return bestCertificationTier(a) - bestCertificationTier(b) || compareInstructorKana(a, b);
}

/** 表示名のかな順で候補を比較する。 */
export function compareInstructorKana(
  a: Pick<CertificationSortableCandidate, 'displayName' | 'displayNameKana'>,
  b: Pick<CertificationSortableCandidate, 'displayName' | 'displayNameKana'>,
): number {
  const aKey = a.displayNameKana ?? a.displayName;
  const bKey = b.displayNameKana ?? b.displayName;
  return aKey.localeCompare(bKey, 'ja-JP');
}
