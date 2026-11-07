import { describe, expect, it } from 'vitest';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext, AutoAssignExecutionParams } from '../src/features/shifts/schema';
import { resolveInitialRequiredCount } from '../src/features/shifts/staffing';

/** 平日／土日祝の人数指定を日別の必要人数へ展開して実行パラメータを作る。 */
const createExecutionParams = ({
  weekdayRequiredCount = 1,
  weekendHolidayRequiredCount = 1,
  ...overrides
}: Partial<AutoAssignExecutionParams> & {
  weekdayRequiredCount?: number;
  weekendHolidayRequiredCount?: number;
} = {}): AutoAssignExecutionParams => {
  const targetDates = overrides.targetDates ?? ['2026-01-05'];
  return {
    shiftTypeId: 'morning',
    targetDates,
    requiredCountByDate: Object.fromEntries(
      targetDates.map((date) => [
        date,
        resolveInitialRequiredCount(date, {
          weekday: weekdayRequiredCount,
          weekendHoliday: weekendHolidayRequiredCount,
        }),
      ]),
    ),
    ...overrides,
  };
};

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
          { certificationId: 'advanced', tierRank: 3 },
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

  it('候補リストにいても必要資格が一致しない人を除外する', () => {
    const context = createAutoAssignContext();
    context.instructors[1]!.certificationIds = ['unrelated'];
    const proposal = solveAutoAssignments(
      context,
      createExecutionParams({ weekdayRequiredCount: 3 }),
      1,
    ).proposals[0];
    expect(proposal?.instructorIds).not.toContain('b');
    expect(proposal?.shortage.count).toBe(1);
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
    });
    const first = solveAutoAssignments(createAutoAssignContext(), executionParams, 42);

    expect(solveAutoAssignments(createAutoAssignContext(), executionParams, 42)).toEqual(first);
    expect(first.proposals[0]?.instructorIds).toHaveLength(2);
    expect(first.proposals[0]?.shortage.reasons).toEqual([]);
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
  it('勤務可能は勤務日数・資格構成・連勤の不利があっても要調整より優先する', () => {
    const context = pairContext(2, 20);
    context.existingAssignments.push(
      ...['2026-01-02', '2026-01-03', '2026-01-04'].map((date) => ({
        date,
        departmentCode: 'ski' as const,
        shiftTypeId: 'x',
        instructorIds: ['b'],
      })),
    );
    context.availabilities = [{ instructorId: 'a', date: '2026-01-05', type: 'AVOID', note: null }];
    const proposal = solveAutoAssignments(context, createExecutionParams(), 1).proposals[0];
    expect(proposal?.instructorIds).toEqual(['b']);
    expect(proposal?.reviewReasons).toContain('認定指導員のみの構成');
  });

  it('3人目も要調整で埋め、確認理由を返す', () => {
    const context = createAutoAssignContext({
      availabilities: [{ instructorId: 'c', date: '2026-01-05', type: 'AVOID', note: null }],
    });
    const proposal = solveAutoAssignments(
      context,
      createExecutionParams({ weekdayRequiredCount: 3 }),
      1,
    ).proposals[0];
    expect(proposal?.instructorIds).toHaveLength(3);
    expect(proposal?.shortage.count).toBe(0);
    expect(proposal?.reviewReasons).toContain('要調整の勤務: C');
  });

  it.each([
    [6, 5, 'b'],
    [20, 2, 'b'],
    [5, 5, 'a'],
  ])('準指導員%s日・認定%s日なら%sを選ぶ', (upper, certified, expected) => {
    expect(
      solveAutoAssignments(pairContext(upper, certified), createExecutionParams(), 1).proposals[0]
        ?.instructorIds,
    ).toEqual([expected]);
  });

  it('出勤可能日数で比例配分せず、対象部門の累計を近づける', () => {
    const context = pairContext(2, 0);
    context.availabilities = [
      { instructorId: 'b', date: '2026-01-06', type: 'UNAVAILABLE', note: null },
    ];
    const proposals = solveAutoAssignments(
      context,
      createExecutionParams({ targetDates: ['2026-01-05', '2026-01-06'] }),
      1,
    ).proposals;
    expect(proposals[0]?.instructorIds).toEqual(['b']);
    expect(proposals[1]?.instructorIds).toEqual(['a']);
  });

  it('他部門の勤務日数と連勤は評価に含めない', () => {
    const context = pairContext(0, 1);
    context.existingAssignments.push(
      ...['2026-01-02', '2026-01-03', '2026-01-04'].map((date) => ({
        date,
        departmentCode: 'snowboard' as const,
        shiftTypeId: 'x',
        instructorIds: ['a'],
      })),
    );
    expect(
      solveAutoAssignments(context, createExecutionParams(), 1).proposals[0]?.instructorIds,
    ).toEqual(['a']);
  });

  it('4連勤目を勤務日数差より優先して避ける', () => {
    const context = pairContext(0, 20);
    context.existingAssignments.push(
      ...['2026-01-02', '2026-01-03', '2026-01-04'].map((date) => ({
        date,
        departmentCode: 'ski' as const,
        shiftTypeId: 'x',
        instructorIds: ['a'],
      })),
    );
    expect(
      solveAutoAssignments(context, createExecutionParams(), 1).proposals[0]?.instructorIds,
    ).toEqual(['b']);
  });

  it('3連勤目までは勤務日数を優先する', () => {
    const context = pairContext(0, 5);
    context.existingAssignments.push(
      ...['2026-01-03', '2026-01-04'].map((date) => ({
        date,
        departmentCode: 'ski' as const,
        shiftTypeId: 'x',
        instructorIds: ['a'],
      })),
    );
    expect(
      solveAutoAssignments(context, createExecutionParams(), 1).proposals[0]?.instructorIds,
    ).toEqual(['a']);
  });

  it('前後の勤務をつないだ4連勤と月境界を判定する', () => {
    const context = pairContext(0, 10);
    context.existingAssignments.push(
      ...['2025-12-30', '2025-12-31', '2026-01-02'].map((date) => ({
        date,
        departmentCode: 'ski' as const,
        shiftTypeId: 'x',
        instructorIds: ['a'],
      })),
    );
    expect(
      solveAutoAssignments(context, createExecutionParams({ targetDates: ['2026-01-01'] }), 1)
        .proposals[0]?.instructorIds,
    ).toEqual(['b']);
  });

  it('代わりがいなければ4連勤以上も割り当てる', () => {
    const context = pairContext(0, 0);
    context.availabilities = [
      { instructorId: 'b', date: '2026-01-05', type: 'UNAVAILABLE', note: null },
    ];
    context.existingAssignments.push(
      ...['2026-01-02', '2026-01-03', '2026-01-04'].map((date) => ({
        date,
        departmentCode: 'ski' as const,
        shiftTypeId: 'x',
        instructorIds: ['a'],
      })),
    );
    expect(
      solveAutoAssignments(context, createExecutionParams(), 1).proposals[0]?.instructorIds,
    ).toEqual(['a']);
  });

  it('対象枠の元の勤務を除去して置換し、別枠の重複は除外する', () => {
    const context = pairContext(0, 0);
    context.existingAssignments = [
      { date: '2026-01-05', departmentCode: 'ski', shiftTypeId: 'morning', instructorIds: ['a'] },
      { date: '2026-01-05', departmentCode: 'ski', shiftTypeId: 'other', instructorIds: ['b'] },
    ];
    expect(
      solveAutoAssignments(context, createExecutionParams(), 1).proposals[0]?.instructorIds,
    ).toEqual(['a']);
  });

  it('未連携・未申告・申告済みで提案と確認理由を変えない', () => {
    const context = pairContext(0, 0);
    const submitted = solveAutoAssignments(context, createExecutionParams(), 3);
    context.instructors[0]!.availabilityStatus = 'NOT_LINKED';
    context.instructors[1]!.availabilityStatus = 'NOT_SUBMITTED';
    expect(solveAutoAssignments(context, createExecutionParams(), 3)).toEqual(submitted);
  });

  it('月全体の割当で4連勤を作らず勤務日数を平準化する', () => {
    const context = pairContext(0, 0);
    const proposals = solveAutoAssignments(
      context,
      createExecutionParams({
        targetDates: [
          '2026-01-01',
          '2026-01-02',
          '2026-01-03',
          '2026-01-04',
          '2026-01-05',
          '2026-01-06',
        ],
      }),
      1,
    ).proposals;
    expect(proposals.filter((p) => p.instructorIds.includes('a'))).toHaveLength(3);
    expect(proposals.filter((p) => p.instructorIds.includes('b'))).toHaveLength(3);
    for (let i = 0; i <= 2; i += 1) {
      expect(new Set(proposals.slice(i, i + 4).flatMap((p) => p.instructorIds)).size).toBe(2);
    }
  });

  it('30人・1か月の案でも人数と平準化を維持する', () => {
    const context = createAutoAssignContext();
    context.instructors = Array.from({ length: 30 }, (_, index) => ({
      id: `person-${index}`,
      displayName: `候補${index}`,
      certificationIds: [index % 3 === 0 ? 'advanced' : 'basic'],
      availabilityStatus: 'SUBMITTED',
    }));
    context.frames[0]!.eligibleInstructorIds = context.instructors.map(
      (instructor) => instructor.id,
    );
    const proposals = solveAutoAssignments(
      context,
      createExecutionParams({
        weekdayRequiredCount: 2,
        weekendHolidayRequiredCount: 3,
        targetDates: Array.from(
          { length: 31 },
          (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`,
        ),
      }),
      1,
    ).proposals;
    expect(proposals).toHaveLength(31);
    expect(proposals.every((proposal) => proposal.shortage.count === 0)).toBe(true);
    const counts = context.instructors.map(
      ({ id }) => proposals.filter((proposal) => proposal.instructorIds.includes(id)).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  }, 15_000);

  it('同点なら2名以上の枠で異なるランクを混ぜる', () => {
    const proposals = solveAutoAssignments(
      createAutoAssignContext(),
      createExecutionParams({ weekdayRequiredCount: 2 }),
      1,
    ).proposals;
    expect(proposals[0]?.instructorIds).toContain('c');
    expect(proposals[0]?.reviewReasons).toEqual([]);
  });
});

// 既存勤務は1日おきに置き、資格と累計日数の比較に連勤の条件を混ぜない。
function pairContext(upperDays: number, certifiedDays: number): AutoAssignContext {
  const context = createAutoAssignContext();
  context.instructors = [
    { id: 'a', displayName: 'A', certificationIds: ['upper'], availabilityStatus: 'SUBMITTED' },
    { id: 'b', displayName: 'B', certificationIds: ['certified'], availabilityStatus: 'SUBMITTED' },
  ];
  context.frames = [
    {
      shiftTypeId: 'morning',
      eligibleInstructorIds: ['a', 'b'],
      certificationTiers: [
        { certificationId: 'upper', tierRank: 2 },
        { certificationId: 'certified', tierRank: 3 },
      ],
    },
  ];
  context.existingAssignments = [
    ['a', upperDays],
    ['b', certifiedDays],
  ].flatMap(([id, count]) =>
    Array.from({ length: Number(count) }, (_, index) => ({
      date: new Date(Date.UTC(2025, 10, 1 + index * 2)).toISOString().slice(0, 10),
      departmentCode: 'ski' as const,
      shiftTypeId: 'x',
      instructorIds: [String(id)],
    })),
  );
  return context;
}
