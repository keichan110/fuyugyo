import type { Availability } from '../availabilities/schema';

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

/** グループ内での候補の並び順。 */
export type CandidateSortMode = 'certification' | 'kana' | 'workload';

/** 勤務可用性による表示グループ。未入力は申告記録なしを表す。 */
const CANDIDATE_GROUPS = [
  { type: 'AVAILABLE', label: '勤務可' },
  { type: 'NOT_ENTERED', label: '未入力' },
  { type: 'AVOID', label: '要調整' },
  { type: 'UNAVAILABLE', label: '勤務不可' },
] as const;

/**
 * 検索結果を勤務可用性の順にまとめ、各グループ内だけを指定の順序で並べる。
 * 同日他枠の配置者は末尾に分け、部門・種別ごとのブロックにまとめる。空グループは返さない。
 */
export function groupAssignmentCandidates<
  T extends CertificationSortableCandidate & { id: string },
>({
  candidates,
  availabilityByInstructor,
  conflictLabelById,
  search,
  sortMode,
  loadByInstructor,
}: {
  candidates: readonly T[];
  availabilityByInstructor: ReadonlyMap<string, Pick<Availability, 'type'>>;
  conflictLabelById: ReadonlyMap<string, string>;
  search: string;
  sortMode: CandidateSortMode;
  loadByInstructor: ReadonlyMap<string, number>;
}) {
  const query = search.trim().toLocaleLowerCase('ja-JP');
  const matched = candidates.filter((candidate) =>
    `${candidate.displayName} ${candidate.displayNameKana ?? ''}`
      .toLocaleLowerCase('ja-JP')
      .includes(query),
  );
  const compare = (a: T, b: T) => {
    if (sortMode === 'workload') {
      return (
        (loadByInstructor.get(a.id) ?? 0) - (loadByInstructor.get(b.id) ?? 0) ||
        compareInstructorKana(a, b)
      );
    }
    return sortMode === 'certification'
      ? compareInstructorCertification(a, b)
      : compareInstructorKana(a, b);
  };
  const groups = CANDIDATE_GROUPS.map((group) => ({
    ...group,
    candidates: matched
      .filter(
        (candidate) =>
          !conflictLabelById.has(candidate.id) &&
          (availabilityByInstructor.get(candidate.id)?.type ?? 'NOT_ENTERED') === group.type,
      )
      .sort(compare),
  })).filter((group) => group.candidates.length > 0);
  const byDestination = new Map<string, T[]>();
  for (const candidate of matched) {
    const label = conflictLabelById.get(candidate.id);
    if (label === undefined) continue;
    const people = byDestination.get(label) ?? [];
    people.push(candidate);
    byDestination.set(label, people);
  }
  const blocks = [...byDestination]
    .sort(([a], [b]) => a.localeCompare(b, 'ja-JP'))
    .map(([label, people]) => ({ label, candidates: people.sort(compare) }));
  if (blocks.length === 0) return groups;
  return [
    ...groups,
    {
      type: 'ASSIGNED' as const,
      label: '配置済み',
      candidates: blocks.flatMap((block) => block.candidates),
      blocks,
    },
  ];
}
