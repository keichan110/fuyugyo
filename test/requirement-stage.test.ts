import { describe, expect, it } from 'vitest';

import {
  applyAutoAssignRequirements,
  applyBulkRequirements,
  bulkRequirementTargetDates,
  effectiveRequiredCount,
  fixedRequiredCount,
  planAutoAssignRequirements,
  stageManualRequirement,
  type StagedRequirements,
} from '@/features/shifts/components/requirement-stage';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext, AutoAssignProposal } from '../src/features/shifts/schema';

const TYPE = 'lesson';
// 2027-01-09 は土曜、2027-01-12 は火曜（平日）
const SAT = '2027-01-09';
const TUE = '2027-01-12';
const counts = { weekday: 2, weekendHoliday: 3 };
const key = (date: string) => `${date}:${TYPE}`;
const none: StagedRequirements = new Map();

describe('stageManualRequirement', () => {
  it('保存済みと異なる値は manual でステージする', () => {
    const staged = stageManualRequirement(none, new Map(), key(TUE), 4);
    expect(staged.get(key(TUE))).toEqual({ requiredCount: 4, source: 'manual' });
  });

  it('保存済みの値と同じならステージから除く', () => {
    const saved = new Map([[key(TUE), 4]]);
    const staged = stageManualRequirement(none, saved, key(TUE), 5);
    expect(stageManualRequirement(staged, saved, key(TUE), 4).size).toBe(0);
  });

  it('未設定の日を未設定に戻す操作はステージしない。保存済みを null にするとステージする', () => {
    expect(stageManualRequirement(none, new Map(), key(TUE), null).size).toBe(0);
    const staged = stageManualRequirement(none, new Map([[key(TUE), 2]]), key(TUE), null);
    expect(staged.get(key(TUE))).toEqual({ requiredCount: null, source: 'manual' });
  });
});

describe('実効値の解決', () => {
  const saved = new Map([[key(TUE), 2]]);
  const defaultStaged: StagedRequirements = new Map([
    [key(SAT), { requiredCount: 3, source: 'default' }],
  ]);

  it('表示用はステージ値を保存値より優先する', () => {
    expect(effectiveRequiredCount(defaultStaged, saved, key(SAT))).toBe(3);
    expect(effectiveRequiredCount(none, saved, key(TUE))).toBe(2);
    expect(effectiveRequiredCount(none, saved, key(SAT))).toBeNull();
  });

  it('fixed は default のステージを含めず、manual と保存値だけを見る', () => {
    expect(fixedRequiredCount(defaultStaged, saved, key(SAT))).toBeNull();
    const manual = stageManualRequirement(none, saved, key(TUE), 0);
    expect(fixedRequiredCount(manual, saved, key(TUE))).toBe(0);
  });
});

describe('planAutoAssignRequirements', () => {
  it('確定値を優先し、未設定日だけ初期値を使う', () => {
    const saved = new Map([[key(SAT), 1]]);
    const plan = planAutoAssignRequirements({
      dates: [SAT, TUE],
      shiftTypeId: TYPE,
      staged: none,
      saved,
      initialCounts: counts,
    });
    expect(plan.requiredCountByDate).toEqual({ [SAT]: 1, [TUE]: 2 });
  });

  it('0名の日と、初期値が0で解決された日をソルバー対象から除く', () => {
    const saved = new Map([[key(SAT), 0]]);
    const plan = planAutoAssignRequirements({
      dates: [SAT, TUE],
      shiftTypeId: TYPE,
      staged: none,
      saved,
      initialCounts: { weekday: 0, weekendHoliday: 3 },
    });
    expect(plan.solverDates).toEqual([]);
    expect(plan.resolvedByDate.has(SAT)).toBe(false);
    expect(plan.resolvedByDate.get(TUE)).toBe(0);
  });

  it('人数を変えて再実行すると default の日だけ再計算され、manual は保たれる', () => {
    const proposals = (dates: string[]): AutoAssignProposal[] =>
      dates.map((date) => ({
        date,
        shiftTypeId: TYPE,
        instructorIds: [],
        shortage: { count: 0, reasons: [] },
      }));
    const run = (
      staged: StagedRequirements,
      initial: { weekday: number; weekendHoliday: number },
    ) => {
      const plan = planAutoAssignRequirements({
        dates: [SAT, TUE],
        shiftTypeId: TYPE,
        staged,
        saved: new Map(),
        initialCounts: initial,
      });
      return {
        plan,
        staged: applyAutoAssignRequirements({
          staged,
          saved: new Map(),
          shiftTypeId: TYPE,
          proposals: proposals(plan.solverDates),
          plan,
        }),
      };
    };
    const manual = stageManualRequirement(none, new Map(), key(SAT), 5);
    const first = run(manual, counts);
    expect(first.staged.get(key(TUE))).toEqual({ requiredCount: 2, source: 'default' });
    expect(first.staged.get(key(SAT))).toEqual({ requiredCount: 5, source: 'manual' });

    const second = run(first.staged, { weekday: 4, weekendHoliday: 6 });
    expect(second.plan.requiredCountByDate).toEqual({ [SAT]: 5, [TUE]: 4 });
    expect(second.staged.get(key(TUE))).toEqual({ requiredCount: 4, source: 'default' });
    expect(second.staged.get(key(SAT))?.requiredCount).toBe(5);
  });

  it('解決後0名で除外された未設定日も初期値(0)を default でステージする', () => {
    const plan = planAutoAssignRequirements({
      dates: [TUE, SAT],
      shiftTypeId: TYPE,
      staged: none,
      saved: new Map(),
      initialCounts: { weekday: 0, weekendHoliday: 3 },
    });
    const staged = applyAutoAssignRequirements({
      staged: none,
      saved: new Map(),
      shiftTypeId: TYPE,
      proposals: [
        { date: SAT, shiftTypeId: TYPE, instructorIds: [], shortage: { count: 0, reasons: [] } },
      ],
      plan,
    });
    expect(staged.get(key(TUE))).toEqual({ requiredCount: 0, source: 'default' });
    expect(staged.get(key(SAT))).toEqual({ requiredCount: 3, source: 'default' });
  });

  it('提案が空なら必要人数を一切ステージしない', () => {
    const plan = planAutoAssignRequirements({
      dates: [TUE],
      shiftTypeId: TYPE,
      staged: none,
      saved: new Map(),
      initialCounts: counts,
    });
    expect(
      applyAutoAssignRequirements({
        staged: none,
        saved: new Map(),
        shiftTypeId: TYPE,
        proposals: [],
        plan,
      }).size,
    ).toBe(0);
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
          certificationTiers: [{ certificationId: 'cert', tierRank: 1 }],
          eligibleInstructorIds: ['a', 'b', 'c', 'd'],
        },
      ],
      availabilities: [],
      existingAssignments: [],
    };
    const saved = new Map([[key(TUE), 1]]);
    const plan = planAutoAssignRequirements({
      dates: [SAT, TUE],
      shiftTypeId: TYPE,
      staged: none,
      saved,
      initialCounts: counts,
    });
    const { proposals } = solveAutoAssignments(
      context,
      {
        shiftTypeId: TYPE,
        targetDates: plan.solverDates,
        requiredCountByDate: plan.requiredCountByDate,
      },
      1,
    );
    expect(Object.fromEntries(proposals.map((p) => [p.date, p.instructorIds.length]))).toEqual({
      [SAT]: 3,
      [TUE]: 1,
    });
  });
});

describe('一括設定', () => {
  const dates = [SAT, TUE];

  it('未設定日と default 由来の日だけが対象で、設定済みは上書きしない', () => {
    const saved = new Map([[key(TUE), 1]]);
    const staged: StagedRequirements = new Map([
      [key(SAT), { requiredCount: 9, source: 'default' }],
    ]);
    expect(bulkRequirementTargetDates({ dates, shiftTypeId: TYPE, staged, saved })).toEqual([SAT]);
    const next = applyBulkRequirements({ dates, shiftTypeId: TYPE, staged, saved, counts });
    expect(next.get(key(SAT))).toEqual({ requiredCount: 3, source: 'manual' });
    expect(next.has(key(TUE))).toBe(false);
  });

  it('manual でステージ済みの日は対象外', () => {
    const staged = stageManualRequirement(none, new Map(), key(SAT), 7);
    expect(
      bulkRequirementTargetDates({ dates, shiftTypeId: TYPE, staged, saved: new Map() }),
    ).toEqual([TUE]);
  });
});
