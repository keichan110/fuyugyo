import { describe, expect, it } from 'vitest';

import { applyAutoAssignProposals } from '@/features/shifts/components/auto-assign-stage';

describe('applyAutoAssignProposals', () => {
  it('対象日の既存ステージを白紙にして提案で置き換える', () => {
    const result = applyAutoAssignProposals({
      stagedCells: new Map([
        ['2026-01-10:lesson', { instructorIds: ['old'], description: '保持しない' }],
        ['2026-01-11:lesson', { instructorIds: ['other'], description: '対象外' }],
      ]),
      proposals: [
        {
          date: '2026-01-10',
          shiftTypeId: 'lesson',
          instructorIds: ['a', 'b'],
          shortage: { count: 0, reasons: [] },
        },
      ],
    });

    expect(result).toEqual(
      new Map([
        ['2026-01-10:lesson', { instructorIds: ['a', 'b'], description: '' }],
        ['2026-01-11:lesson', { instructorIds: ['other'], description: '対象外' }],
      ]),
    );
  });
});
