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
        certificationTiers: [
          { certificationId: 'basic', tierRank: 1 },
          { certificationId: 'advanced', tierRank: 2 },
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

  it('複数資格保有者は最上位の tier として構成を評価する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 'both',
            displayName: 'Both',
            certificationIds: ['top', 'lower'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'lower-a',
            displayName: 'Lower A',
            certificationIds: ['lower'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'lower-b',
            displayName: 'Lower B',
            certificationIds: ['lower'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'lower-c',
            displayName: 'Lower C',
            certificationIds: ['lower'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 'top', tierRank: 1 },
              { certificationId: 'lower', tierRank: 3 },
            ],
            eligibleInstructorIds: ['both', 'lower-a', 'lower-b', 'lower-c'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 3 }),
      3,
    );

    expect(result.proposals[0]?.instructorIds).toContain('both');
  });

  it('公平性が同じなら異なる tier が揃う構成を選ぶ', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 't1',
            displayName: 'T1',
            certificationIds: ['t1'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't2',
            displayName: 'T2',
            certificationIds: ['t2'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't3a',
            displayName: 'T3A',
            certificationIds: ['t3'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't3b',
            displayName: 'T3B',
            certificationIds: ['t3'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 't1', tierRank: 1 },
              { certificationId: 't2', tierRank: 2 },
              { certificationId: 't3', tierRank: 3 },
            ],
            eligibleInstructorIds: ['t1', 't2', 't3a', 't3b'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 3 }),
      9,
    );

    expect(new Set(result.proposals[0]?.instructorIds.map((id) => id.slice(0, 2)))).toEqual(
      new Set(['t1', 't2', 't3']),
    );
  });

  it('AVOID の回避を資格構成の安全性より優先する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 'top',
            displayName: 'Top',
            certificationIds: ['top'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'lower',
            displayName: 'Lower',
            certificationIds: ['lower'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 'top', tierRank: 1 },
              { certificationId: 'lower', tierRank: 3 },
            ],
            eligibleInstructorIds: ['top', 'lower'],
          },
        ],
        availabilities: [{ instructorId: 'top', date: '2026-01-05', type: 'AVOID', note: null }],
      }),
      createExecutionParams(),
      1,
    );

    expect(result.proposals[0]?.instructorIds).toEqual(['lower']);
  });

  it('資格構成の安全性を公平性より優先する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 'top',
            displayName: 'Top',
            certificationIds: ['top'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'lower',
            displayName: 'Lower',
            certificationIds: ['lower'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 'top', tierRank: 1 },
              { certificationId: 'lower', tierRank: 3 },
            ],
            eligibleInstructorIds: ['top', 'lower'],
          },
        ],
        existingAssignments: [
          { date: '2026-01-01', departmentCode: 'ski', shiftTypeId: 'x', instructorIds: ['top'] },
          { date: '2026-01-02', departmentCode: 'ski', shiftTypeId: 'x', instructorIds: ['top'] },
        ],
      }),
      createExecutionParams(),
      1,
    );

    expect(result.proposals[0]?.instructorIds).toEqual(['top']);
  });

  it('安全性が同じなら公平性を段の多様性より優先する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 'top-a',
            displayName: 'Top A',
            certificationIds: ['top'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'top-b',
            displayName: 'Top B',
            certificationIds: ['top'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 'middle',
            displayName: 'Middle',
            certificationIds: ['middle'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 'top', tierRank: 1 },
              { certificationId: 'middle', tierRank: 2 },
            ],
            eligibleInstructorIds: ['top-a', 'top-b', 'middle'],
          },
        ],
        existingAssignments: [
          {
            date: '2026-01-01',
            departmentCode: 'ski',
            shiftTypeId: 'x',
            instructorIds: ['middle'],
          },
          {
            date: '2026-01-02',
            departmentCode: 'ski',
            shiftTypeId: 'x',
            instructorIds: ['middle'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 2 }),
      1,
    );

    expect(result.proposals[0]?.instructorIds).not.toContain('middle');
  });

  it('最上位不在なら level 3 のみより level 2 を含む構成を選ぶ', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: [
          {
            id: 't2',
            displayName: 'T2',
            certificationIds: ['t2'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't3a',
            displayName: 'T3A',
            certificationIds: ['t3'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't3b',
            displayName: 'T3B',
            certificationIds: ['t3'],
            availabilityStatus: 'SUBMITTED',
          },
          {
            id: 't3c',
            displayName: 'T3C',
            certificationIds: ['t3'],
            availabilityStatus: 'SUBMITTED',
          },
        ],
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: [
              { certificationId: 't2', tierRank: 2 },
              { certificationId: 't3', tierRank: 3 },
            ],
            eligibleInstructorIds: ['t2', 't3a', 't3b', 't3c'],
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 3 }),
      2,
    );

    expect(result.proposals[0]?.instructorIds).toContain('t2');
  });

  it('5段構成でも配置人数まで異なる段を揃える', () => {
    const tierRanks = [1, 2, 3, 4, 5];
    const result = solveAutoAssignments(
      createAutoAssignContext({
        instructors: tierRanks.map((tierRank) => ({
          id: `t${tierRank}`,
          displayName: `T${tierRank}`,
          certificationIds: [`t${tierRank}`],
          availabilityStatus: 'SUBMITTED' as const,
        })),
        frames: [
          {
            shiftTypeId: 'morning',
            certificationTiers: tierRanks.map((tierRank) => ({
              certificationId: `t${tierRank}`,
              tierRank,
            })),
            eligibleInstructorIds: tierRanks.map((tierRank) => `t${tierRank}`),
          },
        ],
      }),
      createExecutionParams({ weekdayRequiredCount: 3 }),
      4,
    );

    const selectedTiers = result.proposals[0]?.instructorIds.map((id) => Number(id.slice(1)));
    expect(selectedTiers).toContain(1);
    expect(new Set(selectedTiers).size).toBe(3);
  });

  it('必要資格がない枠を提案対象から除外する', () => {
    const result = solveAutoAssignments(
      createAutoAssignContext({
        frames: [{ shiftTypeId: 'morning', certificationTiers: [], eligibleInstructorIds: ['a'] }],
      }),
      createExecutionParams(),
      1,
    );

    expect(result.proposals).toEqual([]);
  });
});
