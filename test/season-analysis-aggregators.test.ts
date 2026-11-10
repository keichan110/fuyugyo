import { describe, expect, it } from 'vitest';

import {
  buildAnalysisView,
  type AnalysisFilters,
} from '../src/features/season-analysis/aggregators';
import type { SeasonAnalysis } from '../src/features/season-analysis/schema';

/**
 * シーズン分析の集計純粋関数（`buildAnalysisView`）の単体テスト（DB 非依存）。
 * 基準日は 2026-11-10。それより前が実施済み、以降が予定。
 */

const TODAY = '2026-11-10';

const defaultFilters: AnalysisFilters = {
  department: 'all',
  includeDrafts: true,
  countScope: 'allDepartments',
};

type Assignment = SeasonAnalysis['assignments'][number];

function assignment(
  instructorId: string,
  date: string,
  departmentCode: 'ski' | 'snowboard' = 'ski',
  shiftTypeId = 'am',
  shiftStatus: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
): Assignment {
  return { instructorId, date, departmentCode, shiftTypeId, shiftStatus, tierRank: null };
}

function analysis(overrides: Partial<SeasonAnalysis>): SeasonAnalysis {
  return {
    seasonRange: { from: '2026-09-01', to: '2027-08-31' },
    today: TODAY,
    instructors: [],
    assignments: [],
    shifts: [],
    availabilityExceptions: [],
    tierDefinitions: [],
    ...overrides,
  };
}

function instructor(
  id: string,
  qualifiedDepartments: ('ski' | 'snowboard')[] = ['ski'],
  status = 'ACTIVE',
) {
  return { id, displayName: id, status, qualifiedDepartments };
}

function shift(
  date: string,
  overrides: Partial<SeasonAnalysis['shifts'][number]> = {},
): SeasonAnalysis['shifts'][number] {
  return {
    date,
    departmentCode: 'ski',
    shiftTypeId: 'am',
    shiftTypeName: '午前',
    requiredCount: null,
    status: 'PUBLISHED',
    assignedCount: 0,
    ...overrides,
  };
}

function member(view: ReturnType<typeof buildAnalysisView>, id: string) {
  const found = view.members.find((m) => m.id === id);
  if (!found) throw new Error(`member ${id} not found`);
  return found;
}

describe('buildAnalysisView', () => {
  it('同日に複数枠へ入っても勤務日数は1日と数える', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a')],
        assignments: [
          assignment('a', '2026-10-01', 'ski', 'am'),
          assignment('a', '2026-10-01', 'ski', 'pm'),
          assignment('a', '2026-10-01', 'snowboard', 'am'),
        ],
      }),
      defaultFilters,
    );
    const a = member(view, 'a');
    expect(a.total).toBe(1);
    // 部門別は日数なので合算は total を超えうる
    expect(a.departmentDays).toEqual({ ski: 1, snowboard: 1 });
  });

  it('基準日より前を実施済み、基準日以降を予定に分ける', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a')],
        assignments: [
          assignment('a', '2026-11-09'),
          assignment('a', '2026-11-10'),
          assignment('a', '2026-12-01'),
        ],
      }),
      defaultFilters,
    );
    const a = member(view, 'a');
    expect(a.past).toBe(1);
    expect(a.future).toBe(2);
    expect(view.totals).toEqual({ past: 1, future: 2 });
  });

  it('下書きを含めない場合は下書き枠の配置と枠を除外する', () => {
    const data = analysis({
      instructors: [instructor('a'), instructor('b', [])],
      assignments: [
        assignment('a', '2026-10-01'),
        assignment('a', '2026-10-02', 'ski', 'am', 'DRAFT'),
        assignment('b', '2026-10-03', 'ski', 'am', 'DRAFT'),
      ],
      shifts: [shift('2026-10-01'), shift('2026-10-02', { status: 'DRAFT' })],
    });
    const withDrafts = buildAnalysisView(data, defaultFilters);
    const withoutDrafts = buildAnalysisView(data, { ...defaultFilters, includeDrafts: false });
    expect(member(withDrafts, 'a').total).toBe(2);
    expect(withDrafts.members.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(member(withoutDrafts, 'a').total).toBe(1);
    // 下書きだけに配置された資格なしの b は対象外になる
    expect(withoutDrafts.members.map((m) => m.id)).toEqual(['a']);
    expect(withoutDrafts.months).toEqual(['2026-10']);
  });

  it('負荷の数え方を切り替えると選択部門のみの日数になる', () => {
    const data = analysis({
      instructors: [instructor('a')],
      assignments: [
        assignment('a', '2026-10-01', 'ski'),
        assignment('a', '2026-10-02', 'snowboard'),
        assignment('a', '2026-10-03', 'snowboard'),
      ],
    });
    const all = buildAnalysisView(data, { ...defaultFilters, department: 'snowboard' });
    const selected = buildAnalysisView(data, {
      ...defaultFilters,
      department: 'snowboard',
      countScope: 'selectedDepartment',
    });
    expect(member(all, 'a').total).toBe(3);
    expect(member(selected, 'a').total).toBe(2);
  });

  it('部門=全体のときは負荷の数え方に関わらず全部門で数える', () => {
    const data = analysis({
      instructors: [instructor('a')],
      assignments: [
        assignment('a', '2026-10-01', 'ski'),
        assignment('a', '2026-10-02', 'snowboard'),
      ],
    });
    const view = buildAnalysisView(data, { ...defaultFilters, countScope: 'selectedDepartment' });
    expect(member(view, 'a').total).toBe(2);
  });

  it('対象メンバーは部門の有効資格を持つACTIVEな人と、その部門に配置された人（status不問）の和集合', () => {
    const data = analysis({
      instructors: [
        instructor('skiQualified', ['ski']),
        instructor('sbQualified', ['snowboard']),
        instructor('skiInactiveQualified', ['ski'], 'INACTIVE'),
        instructor('sbInactiveAssigned', [], 'INACTIVE'),
        instructor('skiAssignedToSb', ['ski']),
      ],
      assignments: [
        assignment('sbInactiveAssigned', '2026-10-01', 'snowboard'),
        assignment('skiAssignedToSb', '2026-10-02', 'snowboard'),
      ],
    });
    const ids = (department: AnalysisFilters['department']) =>
      buildAnalysisView(data, { ...defaultFilters, department })
        .members.map((m) => m.id)
        .sort();
    expect(ids('ski')).toEqual(['skiAssignedToSb', 'skiQualified']);
    expect(ids('snowboard')).toEqual(['sbInactiveAssigned', 'sbQualified', 'skiAssignedToSb']);
    expect(ids('all')).toEqual([
      'sbInactiveAssigned',
      'sbQualified',
      'skiAssignedToSb',
      'skiQualified',
    ]);
  });

  it('勤務可能日数は枠のある日からUNAVAILABLEを除き、AVOIDは含めて件数を別に持つ', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a')],
        shifts: [
          shift('2026-10-01'),
          shift('2026-10-01', { shiftTypeId: 'pm' }),
          shift('2026-10-02'),
          shift('2026-10-03'),
          shift('2026-10-04', { departmentCode: 'snowboard' }),
        ],
        availabilityExceptions: [
          { instructorId: 'a', date: '2026-10-02', type: 'UNAVAILABLE' },
          { instructorId: 'a', date: '2026-10-03', type: 'AVOID' },
          // 枠のない日の申告は数えない
          { instructorId: 'a', date: '2026-10-20', type: 'UNAVAILABLE' },
        ],
      }),
      defaultFilters,
    );
    const a = member(view, 'a');
    // スキー資格のみなのでスキー枠の 10/1〜10/3 の3日が対象（スノーボード枠の 10/4 は含めない）。
    // UNAVAILABLE の 10/2 を除いて2日
    expect(a.availableDays).toBe(2);
    expect(a.avoidDays).toBe(1);
  });

  it('資格のない部門でも配置された部門の枠日は勤務可能日数に含める', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a')],
        shifts: [
          shift('2026-10-01'),
          shift('2026-10-04', { departmentCode: 'snowboard' }),
          shift('2026-10-05', { departmentCode: 'snowboard' }),
        ],
        assignments: [assignment('a', '2026-10-04', 'snowboard')],
      }),
      defaultFilters,
    );
    expect(member(view, 'a').availableDays).toBe(3);
  });

  it('月別セルは月ごとの対象メンバー中央値との差を持ち、予定のみの月を判別できる', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a'), instructor('b'), instructor('c')],
        shifts: [shift('2026-10-01'), shift('2026-12-01')],
        assignments: [
          assignment('a', '2026-10-01'),
          assignment('a', '2026-10-02'),
          assignment('a', '2026-10-03'),
          assignment('b', '2026-10-01'),
          assignment('a', '2026-12-05'),
        ],
      }),
      defaultFilters,
    );
    expect(view.months).toEqual(['2026-10', '2026-12']);
    // 10月は a=3, b=1, c=0 → 中央値1
    const a = member(view, 'a');
    expect(a.months[0]).toMatchObject({ month: '2026-10', total: 3, diff: 2, past: 3, future: 0 });
    expect(member(view, 'c').months[0]?.diff).toBe(-1);
    // 12月は a=1, b=0, c=0 → 中央値0。予定のみ
    expect(a.months[1]).toMatchObject({ month: '2026-12', total: 1, diff: 1, past: 0, future: 1 });
  });

  it('週別充足は requiredCount のある枠だけを月曜始まりで集計し、不足枠数と予定週を持つ', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a')],
        shifts: [
          // 2026-10-05(月)〜10-11 の週
          shift('2026-10-05', { requiredCount: 3, assignedCount: 2 }),
          shift('2026-10-11', { shiftTypeId: 'pm', requiredCount: 2, assignedCount: 2 }),
          // 必要人数なしは除外
          shift('2026-10-06', { shiftTypeId: 'x', requiredCount: null, assignedCount: 5 }),
          // 今週(11/9〜)・予定週(11/16〜)
          shift('2026-11-10', { requiredCount: 1, assignedCount: 0 }),
          shift('2026-11-17', { requiredCount: 2, assignedCount: 2 }),
        ],
      }),
      defaultFilters,
    );
    expect(view.weeks).toEqual([
      { weekStart: '2026-10-05', phase: 'past', required: 5, assigned: 4, shortageSlots: 1 },
      { weekStart: '2026-11-09', phase: 'current', required: 1, assigned: 0, shortageSlots: 1 },
      { weekStart: '2026-11-16', phase: 'future', required: 2, assigned: 2, shortageSlots: 0 },
    ]);
    expect(view.fill.past).toMatchObject({ required: 5, assigned: 4 });
    expect(view.fill.future).toMatchObject({ required: 3, assigned: 2 });
  });

  it('平均勤務日数と勤務率を返し、対象メンバーがいなければ0・nullになる', () => {
    const view = buildAnalysisView(
      analysis({
        instructors: [instructor('a'), instructor('b')],
        shifts: [shift('2026-10-01'), shift('2026-10-02')],
        assignments: [assignment('a', '2026-10-01'), assignment('a', '2026-10-02')],
      }),
      defaultFilters,
    );
    expect(view.averageDays).toBe(1);
    expect(view.workRatio).toBe(0.5);
    const empty = buildAnalysisView(analysis({}), defaultFilters);
    expect(empty.averageDays).toBe(0);
    expect(empty.workRatio).toBeNull();
  });
});
