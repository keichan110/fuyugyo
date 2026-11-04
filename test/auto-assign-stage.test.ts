import { describe, expect, it } from 'vitest';

import {
  applyAutoAssignProposals,
  contextWithStagedAssignments,
} from '@/features/shifts/components/auto-assign-stage';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';

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

describe('自動割当の確認と未保存編集', () => {
  it('要確認の理由を保存可能な備考へ残す', () => {
    const result = applyAutoAssignProposals({
      stagedCells: new Map(),
      proposals: [
        {
          date: '2026-01-10',
          shiftTypeId: 'lesson',
          instructorIds: ['a'],
          shortage: { count: 0, reasons: [] },
          reviewReasons: ['認定指導員のみの構成', '要調整の勤務: A'],
        },
      ],
    });
    expect(result.get('2026-01-10:lesson')?.description).toBe(
      '要確認: 認定指導員のみの構成\n要確認: 要調整の勤務: A',
    );
  });

  it('当該部門の編集だけを置換し、削除と新規勤務も判断に含める', () => {
    const result = contextWithStagedAssignments(
      {
        departmentCode: 'ski',
        period: { from: '2026-01-01', to: '2026-01-31' },
        instructors: [],
        frames: [],
        availabilities: [],
        existingAssignments: [
          {
            date: '2026-01-10',
            departmentCode: 'ski',
            shiftTypeId: 'lesson',
            instructorIds: ['old'],
          },
          {
            date: '2026-01-10',
            departmentCode: 'snowboard',
            shiftTypeId: 'lesson',
            instructorIds: ['other'],
          },
        ],
      },
      new Map([
        ['2026-01-10:lesson', { instructorIds: [], description: '' }],
        ['2026-01-11:lesson', { instructorIds: ['new'], description: '' }],
      ]),
    );
    expect(result.existingAssignments).toEqual([
      {
        date: '2026-01-10',
        departmentCode: 'snowboard',
        shiftTypeId: 'lesson',
        instructorIds: ['other'],
      },
      { date: '2026-01-10', departmentCode: 'ski', shiftTypeId: 'lesson', instructorIds: [] },
      { date: '2026-01-11', departmentCode: 'ski', shiftTypeId: 'lesson', instructorIds: ['new'] },
    ]);
  });
});

it.each([true, false])('未保存の別枠への追加・削除を重複判定に反映する（追加=%s）', (added) => {
  const context = contextWithStagedAssignments(
    {
      departmentCode: 'ski',
      period: { from: '2026-01-01', to: '2026-01-31' },
      instructors: [
        { id: 'a', displayName: 'A', certificationIds: ['upper'], availabilityStatus: 'SUBMITTED' },
      ],
      frames: [
        {
          shiftTypeId: 'lesson',
          certificationTiers: [{ certificationId: 'upper', tierRank: 1 }],
          eligibleInstructorIds: ['a'],
        },
      ],
      availabilities: [],
      existingAssignments: added
        ? []
        : [
            {
              date: '2026-01-10',
              departmentCode: 'ski',
              shiftTypeId: 'other',
              instructorIds: ['a'],
            },
          ],
    },
    new Map([['2026-01-10:other', { instructorIds: added ? ['a'] : [], description: '' }]]),
  );
  const proposal = solveAutoAssignments(
    context,
    {
      shiftTypeId: 'lesson',
      weekdayRequiredCount: 1,
      weekendHolidayRequiredCount: 1,
      targetDates: ['2026-01-10'],
      holidayDates: [],
    },
    1,
  ).proposals[0];
  expect(proposal?.instructorIds).toEqual(added ? [] : ['a']);
  expect(proposal?.shortage.count).toBe(added ? 1 : 0);
});
