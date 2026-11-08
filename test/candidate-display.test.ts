import { describe, expect, it } from 'vitest';

import {
  bestCertificationTier,
  compareInstructorCertification,
  groupAssignmentCandidates,
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

describe('勤務可用性による候補のグループ表示', () => {
  const candidates = [
    { id: 'unavailable', displayName: '勤務不可の人', displayNameKana: null, certifications: [] },
    { id: 'avoid', displayName: '要調整の人', displayNameKana: null, certifications: [] },
    { id: 'unknown', displayName: '未入力の人', displayNameKana: null, certifications: [] },
    {
      id: 'available-b',
      displayName: '勤務可い',
      displayNameKana: 'イ',
      certifications: [{ shortName: '指導員', tierRank: 1 }],
      hasConflict: true,
    },
    {
      id: 'available-a',
      displayName: '勤務可あ',
      displayNameKana: 'ア',
      certifications: [{ shortName: '準指導員', tierRank: 2 }],
    },
  ];
  const availabilityByInstructor = new Map([
    ['unavailable', { type: 'UNAVAILABLE' }],
    ['avoid', { type: 'AVOID' }],
    ['available-a', { type: 'AVAILABLE' }],
    ['available-b', { type: 'AVAILABLE' }],
  ] satisfies Array<[string, { type: 'AVAILABLE' | 'AVOID' | 'UNAVAILABLE' }]>);
  const input = {
    candidates,
    availabilityByInstructor,
    search: '',
    loadByInstructor: new Map([
      ['available-a', 3],
      ['available-b', 10],
    ]),
  };

  it('競合の有無によらず勤務可・未入力・要調整・勤務不可の順でまとめる', () => {
    const groups = groupAssignmentCandidates({ ...input, sortMode: 'certification' });
    expect(groups.map((group) => group.type)).toEqual([
      'AVAILABLE',
      'NOT_ENTERED',
      'AVOID',
      'UNAVAILABLE',
    ]);
    expect(groups.map((group) => group.candidates.length)).toEqual([2, 1, 1, 1]);
    expect(groups[0]?.candidates.map((candidate) => candidate.id)).toEqual([
      'available-b',
      'available-a',
    ]);
    expect(candidates[0]?.id).toBe('unavailable');
  });

  it.each(['kana', 'workload'] as const)('%sではグループ内だけを並び替える', (sortMode) => {
    const groups = groupAssignmentCandidates({ ...input, sortMode });
    expect(groups[0]?.candidates.map((candidate) => candidate.id)).toEqual([
      'available-a',
      'available-b',
    ]);
    expect(groups[1]?.type).toBe('NOT_ENTERED');
  });

  it('検索後の候補だけを数え、空グループを表示しない', () => {
    const groups = groupAssignmentCandidates({ ...input, sortMode: 'kana', search: ' ア ' });
    expect(groups.map((group) => group.type)).toEqual(['AVAILABLE']);
    expect(groups[0]?.candidates.map((candidate) => candidate.id)).toEqual(['available-a']);
    expect(
      groupAssignmentCandidates({ ...input, sortMode: 'kana', search: '該当しない名前' }),
    ).toEqual([]);
    expect(groupAssignmentCandidates({ ...input, candidates: [], sortMode: 'kana' })).toEqual([]);
  });
});
