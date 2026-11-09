import { describe, expect, it } from 'vitest';

import { buildAssignmentReview } from '../src/features/shifts/components/assignment-review';
import type { AutoAssignContext } from '../src/features/shifts/schema';

const context: AutoAssignContext = {
  departmentCode: 'ski',
  period: { from: '2026-01-01', to: '2026-01-31' },
  instructors: [
    { id: 'a', displayName: '青木', certificationIds: [], availabilityStatus: 'NOT_SUBMITTED' },
  ],
  frames: [],
  availabilities: [],
  publishedSlots: [],
  existingAssignments: ['2025-12-29', '2025-12-30', '2025-12-31'].map((date) => ({
    date,
    departmentCode: 'ski',
    shiftTypeId: 'other',
    instructorIds: ['a'],
  })),
};
const base = {
  days: ['2026-01-01'],
  departmentCode: 'ski',
  shiftTypeId: 'general',
  assignmentsByDay: new Map([['2026-01-01', [{ id: 'a', name: '青木' }]]]),
  savedAssignments: [
    { date: '2026-01-01', departmentCode: 'ski', shiftTypeId: 'general', instructorIds: ['b'] },
  ],
  stagedAssignments: [
    { date: '2026-01-01', departmentCode: 'ski', shiftTypeId: 'general', instructorIds: ['a'] },
  ],
  requiredByDay: new Map([['2026-01-01', 2]]),
  compositionByDay: null,
  availabilities: [
    { instructorId: 'a', date: '2026-01-01', type: 'AVOID' as const, note: '午前は相談' },
  ],
  context,
};

describe('保存前の配置点検', () => {
  it('保存済みからの置換と、不足・要調整・月をまたぐ同部門の連勤を検出する', () => {
    const [day] = buildAssignmentReview(base);
    expect(day).toMatchObject({ addedIds: ['a'], removedIds: ['b'] });
    expect(day?.issues).toEqual([
      { kind: 'shortage', text: '1名不足（配置1 / 必要2名）' },
      { kind: 'availability', text: '青木：要調整（午前は相談）' },
      { kind: 'streak', text: '青木：4連勤（12/29〜01/01）' },
    ]);
  });

  it('手動解除で現在案の警告を解消し、保存後は差分がなくなる', () => {
    const edited = {
      ...base,
      assignmentsByDay: new Map(),
      requiredByDay: new Map([['2026-01-01', 0]]),
      stagedAssignments: [{ ...base.stagedAssignments[0]!, instructorIds: [] }],
    };
    expect(buildAssignmentReview(edited)[0]).toMatchObject({
      issues: [],
      addedIds: [],
      removedIds: ['b'],
    });
    expect(
      buildAssignmentReview({
        ...edited,
        savedAssignments: edited.stagedAssignments,
        stagedAssignments: [],
      })[0],
    ).toMatchObject({ addedIds: [], removedIds: [] });
  });

  it('別部門の勤務は連勤に含めず、同じ日に複数枠へ配置されても重複計数しない', () => {
    const otherContext = {
      ...context,
      existingAssignments: context.existingAssignments.map((cell) => ({
        ...cell,
        departmentCode: 'snowboard' as const,
      })),
    };
    expect(
      buildAssignmentReview({ ...base, context: otherContext })[0]?.issues.some(
        (issue) => issue.kind === 'streak',
      ),
    ).toBe(false);
    const duplicated = {
      ...base,
      stagedAssignments: [
        ...base.stagedAssignments,
        { ...base.stagedAssignments[0]!, shiftTypeId: 'other' },
      ],
    };
    expect(
      buildAssignmentReview(duplicated)[0]?.issues.filter((issue) => issue.kind === 'streak'),
    ).toHaveLength(1);
  });

  it('未取得を要調整・連勤なしと判定せず、必要人数未設定は不足に含めない', () => {
    const day = buildAssignmentReview({
      ...base,
      availabilities: undefined,
      context: undefined,
      requiredByDay: new Map([['2026-01-01', null]]),
    })[0];
    expect(day?.issues).toEqual([]);
    expect(day?.addedIds).toEqual(['a']);
  });

  it('対象外の月内編集で連勤が切れた場合も現在案に反映する', () => {
    const savedAssignments = [
      ...base.savedAssignments,
      { date: '2026-01-02', departmentCode: 'ski', shiftTypeId: 'other', instructorIds: ['a'] },
    ];
    const stagedAssignments = [
      ...base.stagedAssignments,
      { date: '2026-01-02', departmentCode: 'ski', shiftTypeId: 'other', instructorIds: [] },
    ];
    expect(
      buildAssignmentReview({ ...base, savedAssignments, stagedAssignments })[0]?.issues.find(
        (issue) => issue.kind === 'streak',
      )?.text,
    ).toContain('4連勤');
  });
});
