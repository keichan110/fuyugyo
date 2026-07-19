import { describe, expect, it } from 'vitest';

import {
  bestCertificationTier,
  compareInstructorCertification,
  type CertificationSortableCandidate,
} from '../src/features/shifts/candidate-display';

describe('資格順の候補比較', () => {
  it('該当資格の最上位ランク順に並べ、同ランクではかな順にする', () => {
    const candidates: CertificationSortableCandidate[] = [
      { displayName: '山田 太郎', displayNameKana: 'ヤマダ タロウ', certifications: [] },
      {
        displayName: '鈴木 花子',
        displayNameKana: 'スズキ ハナコ',
        certifications: [{ shortName: '準指導員', tierRank: 2 }],
      },
      {
        displayName: '佐藤 次郎',
        displayNameKana: 'サトウ ジロウ',
        certifications: [
          { shortName: '準指導員', tierRank: 2 },
          { shortName: '指導員', tierRank: 1 },
        ],
      },
      {
        displayName: '佐々木 三郎',
        displayNameKana: 'ササキ サブロウ',
        certifications: [{ shortName: '検定員', tierRank: 1 }],
      },
    ];

    expect(
      [...candidates]
        .sort(compareInstructorCertification)
        .map((candidate) => candidate.displayName),
    ).toEqual(['佐々木 三郎', '佐藤 次郎', '鈴木 花子', '山田 太郎']);
    expect(bestCertificationTier(candidates[2]!)).toBe(1);
  });
});
