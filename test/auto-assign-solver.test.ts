import { describe, expect, it } from 'vitest';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext, AutoAssignExecutionParams } from '../src/features/shifts/schema';

const createExecutionParams = (
  overrides: Partial<AutoAssignExecutionParams> = {},
): AutoAssignExecutionParams => ({
  shiftTypeId: 'morning',
  weekdayRequiredCount: 1,
  weekendHolidayRequiredCount: 1,
  targetDates: ['2026-01-05'],
  holidayDates: [],
  ...overrides,
});

function createAutoAssignContext(overrides: Partial<AutoAssignContext> = {}): AutoAssignContext {
  return {
    departmentCode: 'ski',
    period: { from: '2026-01-01', to: '2026-01-31' },
    instructors: [
      { id: 'a', displayName: 'A', certificationIds: ['basic'], availabilityStatus: 'SUBMITTED' },
      { id: 'b', displayName: 'B', certificationIds: ['basic'], availabilityStatus: 'SUBMITTED' },
      {
        id: 'c',
        displayName: 'C',
        certificationIds: ['advanced'],
        availabilityStatus: 'SUBMITTED',
      },
    ],
    frames: [
      {
        shiftTypeId: 'morning',
        certificationLevels: [
          { certificationId: 'basic', level: 10 },
          { certificationId: 'advanced', level: 30 },
        ],
        eligibleInstructorIds: ['a', 'b', 'c'],
      },
    ],
    availabilities: [],
    existingAssignments: [],
    ...overrides,
  };
}

describe('solveAutoAssignments', () => {
  it('UNAVAILABLE・資格不足・同日既存割当を絶対に割り当てない', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        availabilities: [
          { instructorId: 'a', date: '2026-01-05', type: 'UNAVAILABLE', note: null },
        ],
        existingAssignments: [
          {
            date: '2026-01-05',
            departmentCode: 'snowboard',
            shiftTypeId: 'afternoon',
            instructorIds: ['b'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 3 }),
      1,
    );

    expect(result.proposals).toEqual([
      expect.objectContaining({
        instructorIds: ['c'],
        shortage: expect.objectContaining({ count: 2 }),
      }),
    ]);
    expect(result.proposals[0]?.shortage.reasons).toEqual(
      expect.arrayContaining(['UNAVAILABLE: 1名', '同日割当済み: 1名']),
    );
  });

  it('必要人数を上限として守り、足りなければ不足人数を返す', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext(),
      createExecutionParams({ weekdayRequiredCount: 5 }),
      2,
    );

    expect(result.proposals[0]).toMatchObject({
      instructorIds: expect.any(Array),
      shortage: { count: 2 },
    });
    expect(result.proposals[0]?.instructorIds).toHaveLength(3);
  });

  it('同じシードでは同じ提案を再現し、祝日は休日用の必要人数を使う', () => {
    const executionParams = createExecutionParams({
      targetDates: ['2026-01-12'],
      weekendHolidayRequiredCount: 2,
      holidayDates: ['2026-01-12'],
    });
    const first = solveAutoAssignments(createAutoAssignContext(), executionParams, 42);

    expect(solveAutoAssignments(createAutoAssignContext(), executionParams, 42)).toEqual(first);
    expect(first.proposals[0]?.instructorIds).toHaveLength(2);
    expect(first.proposals[0]?.shortage.reasons).toEqual([]);
  });

  it('capacity に応じた期待値から、公平性を全候補で評価する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        existingAssignments: [
          { date: '2026-01-01', departmentCode: 'ski', shiftTypeId: 'x', instructorIds: ['a'] },
          { date: '2026-01-02', departmentCode: 'ski', shiftTypeId: 'x', instructorIds: ['a'] },
        ],
      }),
      createExecutionParams({ targetDates: ['2026-01-05', '2026-01-06'] }),
      4,
    );

    expect(result.proposals.flatMap((proposal) => proposal.instructorIds)).not.toContain('a');
  });

  it('資格 level の飛び番号を正規化しても同じ提案を返す', () => {
    const first = solveAutoAssignments(
      createAutoAssignContext(),
      createExecutionParams({ weekdayRequiredCount: 2 }),
      8,
    );
    const normalized = solveAutoAssignments(
      createAutoAssignContext({
        frames: [
          {
            shiftTypeId: 'morning',
            certificationLevels: [
              { certificationId: 'basic', level: 1 },
              { certificationId: 'advanced', level: 2 },
            ],
            eligibleInstructorIds: ['a', 'b', 'c'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 2 }),
      8,
    );

    expect(normalized).toEqual(first);
  });

  it('level 順に候補者を選ばず、同じ条件ならシードにより候補を変える', () => {
    const result = new Set(
      Array.from(
        { length: 12 },
        (_, seed) =>
          solveAutoAssignments(createAutoAssignContext(), createExecutionParams(), seed)
            .proposals[0]?.instructorIds[0],
      ),
    );

    expect(result.size).toBeGreaterThan(1);
  });

  it('必要資格がない枠を提案対象から除外する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        frames: [{ shiftTypeId: 'morning', certificationLevels: [], eligibleInstructorIds: ['a'] }],
      }),
      createExecutionParams(),
      1,
    );

    expect(result.proposals).toEqual([]);
  });
});
