import { describe, expect, it } from 'vitest';

import {
  applyBulkRequirements,
  bulkRequirementTargetDates,
  countAutoAssignSelectableDates,
  effectiveRequiredCount,
  isAutoAssignSelectable,
  planAutoAssignTargets,
  stageRequirement,
  type StagedRequirements,
} from '@/features/shifts/components/requirement-stage';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext } from '../src/features/shifts/schema';

const TYPE = 'lesson';
// 2027-01-09 は土曜、2027-01-12 は火曜（平日）
const SAT = '2027-01-09';
const TUE = '2027-01-12';
const counts = { weekday: 2, weekendHoliday: 3 };
const key = (date: string) => `${date}:${TYPE}`;
const none: StagedRequirements = new Map();

describe('stageRequirement', () => {
  it('保存済みと異なる値をステージする', () => {
    const staged = stageRequirement(none, new Map(), key(TUE), 4);
    expect(staged.get(key(TUE))).toEqual({ requiredCount: 4 });
  });

  it('保存済みの値と同じならステージから除く', () => {
    const saved = new Map([[key(TUE), 4]]);
    const staged = stageRequirement(none, saved, key(TUE), 5);
    expect(stageRequirement(staged, saved, key(TUE), 4).size).toBe(0);
  });

  it('未設定の日を未設定に戻す操作はステージしない。保存済みを null にするとステージする', () => {
    expect(stageRequirement(none, new Map(), key(TUE), null).size).toBe(0);
    const staged = stageRequirement(none, new Map([[key(TUE), 2]]), key(TUE), null);
    expect(staged.get(key(TUE))).toEqual({ requiredCount: null });
  });
});

describe('実効値', () => {
  it('未保存の値を保存済みの値より優先する', () => {
    const saved = new Map([[key(TUE), 2]]);
    const staged = stageRequirement(none, saved, key(TUE), 5);
    expect(effectiveRequiredCount(staged, saved, key(TUE))).toBe(5);
    expect(effectiveRequiredCount(none, saved, key(TUE))).toBe(2);
    expect(effectiveRequiredCount(none, saved, key(SAT))).toBeNull();
  });
});

describe('自動割当の対象', () => {
  it('実効値が1名以上の日だけ選択でき、未設定と0名は選べない', () => {
    const saved = new Map([
      [key(SAT), 3],
      [key(TUE), 0],
    ]);
    expect(isAutoAssignSelectable(none, saved, SAT, TYPE)).toBe(true);
    expect(isAutoAssignSelectable(none, saved, TUE, TYPE)).toBe(false);
    expect(isAutoAssignSelectable(none, saved, '2027-01-13', TYPE)).toBe(false);
  });

  it('選べる日の数を数え、未設定と0名だけなら0日になる', () => {
    const dates = [SAT, TUE];
    const base = { dates, shiftTypeId: TYPE, staged: none };
    expect(countAutoAssignSelectableDates({ ...base, saved: new Map() })).toBe(0);
    expect(countAutoAssignSelectableDates({ ...base, saved: new Map([[key(SAT), 0]]) })).toBe(0);
    expect(countAutoAssignSelectableDates({ ...base, saved: new Map([[key(SAT), 2]]) })).toBe(1);
    const staged = stageRequirement(none, new Map(), key(TUE), 1);
    expect(countAutoAssignSelectableDates({ ...base, staged, saved: new Map() })).toBe(1);
  });

  it('未保存の必要人数が対象判定と人数に反映される', () => {
    const saved = new Map([[key(SAT), 3]]);
    const staged = stageRequirement(stageRequirement(none, saved, key(TUE), 2), saved, key(SAT), 0);
    const plan = planAutoAssignTargets({
      dates: [SAT, TUE, '2027-01-13'],
      shiftTypeId: TYPE,
      staged,
      saved,
    });
    expect(plan.targetDates).toEqual([TUE]);
    expect(plan.requiredCountByDate).toEqual({ [TUE]: 2 });
  });

  it('日別の人数がソルバーの配置人数に反映される', () => {
    const context: AutoAssignContext = {
      departmentCode: 'ski',
      period: { from: '2027-01-01', to: '2027-01-31' },
      instructors: ['a', 'b', 'c', 'd'].map((id) => ({
        id,
        displayName: id,
        certificationIds: ['cert'],
        availabilityStatus: 'SUBMITTED' as const,
      })),
      frames: [
        {
          shiftTypeId: TYPE,
          certificationTiers: [{ certificationId: 'cert', tierRank: 1, shortName: '資' }],
          eligibleInstructorIds: ['a', 'b', 'c', 'd'],
        },
      ],
      availabilities: [],
      existingAssignments: [],
    };
    const saved = new Map([
      [key(SAT), 3],
      [key(TUE), 1],
    ]);
    const plan = planAutoAssignTargets({
      dates: [SAT, TUE],
      shiftTypeId: TYPE,
      staged: none,
      saved,
    });
    const { proposals } = solveAutoAssignments(context, { shiftTypeId: TYPE, ...plan }, 1);
    expect(Object.fromEntries(proposals.map((p) => [p.date, p.instructorIds.length]))).toEqual({
      [SAT]: 3,
      [TUE]: 1,
    });
  });
});

describe('一括設定', () => {
  const dates = [SAT, TUE];

  it('実効値が未設定の日だけが対象で、設定済みと0名の日は上書きしない', () => {
    const saved = new Map([[key(TUE), 0]]);
    expect(bulkRequirementTargetDates({ dates, shiftTypeId: TYPE, staged: none, saved })).toEqual([
      SAT,
    ]);
    const next = applyBulkRequirements({ dates, shiftTypeId: TYPE, staged: none, saved, counts });
    expect(next.get(key(SAT))).toEqual({ requiredCount: 3 });
    expect(next.has(key(TUE))).toBe(false);
  });

  it('未保存で設定した日も対象外', () => {
    const staged = stageRequirement(none, new Map(), key(SAT), 7);
    expect(
      bulkRequirementTargetDates({ dates, shiftTypeId: TYPE, staged, saved: new Map() }),
    ).toEqual([TUE]);
  });
});
