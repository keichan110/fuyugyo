import { describe, expect, it } from 'vitest';

import { normalizeTierRanks } from '../src/features/certification-requirements/tier-ranks';

describe('normalizeTierRanks', () => {
  it('同着を維持しながら欠番を1始まりの連番へ詰める', () => {
    expect(
      normalizeTierRanks([
        { certificationId: 'top', tierRank: 10 },
        { certificationId: 'middle-a', tierRank: 30 },
        { certificationId: 'middle-b', tierRank: 30 },
        { certificationId: 'lower', tierRank: 90 },
      ]),
    ).toEqual([
      { certificationId: 'top', tierRank: 1 },
      { certificationId: 'middle-a', tierRank: 2 },
      { certificationId: 'middle-b', tierRank: 2 },
      { certificationId: 'lower', tierRank: 3 },
    ]);
  });
});
