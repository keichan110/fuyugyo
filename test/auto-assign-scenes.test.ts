import { describe, expect, it } from 'vitest';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext } from '../src/features/shifts/schema';
import { resolveInitialRequiredCount } from '../src/features/shifts/staffing';

/** docs/design/auto-assignment-rules.md のシーンを、実際のソルバーで検証する。 */

type Rank = '指導員' | '準指導員' | '認定指導員';
type Staff = { name: string; rank: Rank; days: number };
type Declaration = { name: string; date: string; type: 'UNAVAILABLE' | 'AVOID' };
type Worked = { name: string; dates: string[]; departmentCode?: 'ski' | 'snowboard' };

const RANKS: Rank[] = ['指導員', '準指導員', '認定指導員'];
const SHIFT = 'general-lesson';

// 累計勤務は連勤へ影響しないよう、前シーズン序盤に1日おきで置く。
function createContext(
  staff: Staff[],
  declarations: Declaration[] = [],
  worked: Worked[] = [],
): AutoAssignContext {
  return {
    departmentCode: 'snowboard',
    period: { from: '2027-01-01', to: '2027-01-31' },
    instructors: staff.map(({ name, rank }) => ({
      id: name,
      displayName: name,
      certificationIds: [rank],
      availabilityStatus: 'SUBMITTED',
    })),
    frames: [
      {
        shiftTypeId: SHIFT,
        certificationTiers: RANKS.map((rank, index) => ({
          certificationId: rank,
          tierRank: index + 1,
          shortName: rank,
        })),
        eligibleInstructorIds: staff.map(({ name }) => name),
      },
    ],
    availabilities: declarations.map(({ name, date, type }) => ({
      instructorId: name,
      date,
      type,
      note: null,
    })),
    existingAssignments: [
      ...staff.flatMap(({ name, days }) =>
        Array.from({ length: days }, (_, index) => ({
          date: new Date(Date.UTC(2026, 10, 1 + index * 2)).toISOString().slice(0, 10),
          departmentCode: 'snowboard' as const,
          shiftTypeId: 'past',
          instructorIds: [name],
        })),
      ),
      ...worked.flatMap(({ name, dates, departmentCode = 'snowboard' }) =>
        dates.map((date) => ({
          date,
          departmentCode,
          shiftTypeId: 'past',
          instructorIds: [name],
        })),
      ),
    ],
  };
}

function solve(
  context: AutoAssignContext,
  required: number,
  overrides: {
    weekdayRequiredCount?: number;
    weekendHolidayRequiredCount?: number;
    targetDates?: string[];
  } = {},
) {
  const { weekdayRequiredCount = required, weekendHolidayRequiredCount = required } = overrides;
  const targetDates = overrides.targetDates ?? ['2027-01-12'];
  return solveAutoAssignments(
    context,
    {
      shiftTypeId: SHIFT,
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
    },
    1,
  ).proposals;
}

function unavailable(names: string[], date: string): Declaration[] {
  return names.map((name) => ({ name, date, type: 'UNAVAILABLE' }));
}

function solveDay(context: AutoAssignContext, required: number) {
  const proposal = solve(context, required)[0];
  if (!proposal) throw new Error('提案がありません');
  return { ...proposal, instructorIds: [...proposal.instructorIds].sort() };
}

describe('シフト担当者のシーン', () => {
  it('シーン1: ランクより勤務日数の少ない人を選ぶ', () => {
    const context = createContext([
      { name: '青木', rank: '指導員', days: 18 },
      { name: '上田', rank: '準指導員', days: 2 },
    ]);
    expect(solveDay(context, 1).instructorIds).toEqual(['上田']);
  });

  it('シーン2: 同じ日数なら上位ランクを選ぶ', () => {
    const context = createContext([
      { name: '青木', rank: '指導員', days: 5 },
      { name: '上田', rank: '準指導員', days: 5 },
      { name: '小川', rank: '認定指導員', days: 5 },
    ]);
    expect(solveDay(context, 1).instructorIds).toEqual(['青木']);
  });

  it('シーン3: 同じ日数なら2人枠は異なるランクを組ませる', () => {
    const context = createContext([
      { name: '青木', rank: '指導員', days: 5 },
      { name: '石田', rank: '指導員', days: 5 },
      { name: '小川', rank: '認定指導員', days: 5 },
      { name: '加藤', rank: '認定指導員', days: 5 },
    ]);
    const { instructorIds } = solveDay(context, 2);
    expect(instructorIds.filter((name) => ['青木', '石田'].includes(name))).toHaveLength(1);
  });

  it.each([
    { upper: 20, certified: 2, expected: ['加藤', '小川'], review: true },
    { upper: 6, certified: 5, expected: ['加藤', '小川'], review: true },
    { upper: 5, certified: 5, expected: ['上田', '小川'], review: false },
  ])(
    'シーン4: 準指導員$upper日・認定指導員$certified日',
    ({ upper, certified, expected, review }) => {
      const context = createContext(
        [
          { name: '小川', rank: '認定指導員', days: 0 },
          { name: '上田', rank: '準指導員', days: upper },
          { name: '加藤', rank: '認定指導員', days: certified },
        ],
        [],
      );
      const proposal = solveDay(context, 2);
      expect(proposal.instructorIds).toEqual([...expected].sort());
      expect(proposal.reviewReasons?.includes('認定指導員のみの構成')).toBe(review);
    },
  );

  it('シーン5: 累計に大差があっても勤務可能な人を要調整より優先する', () => {
    const context = createContext(
      [
        { name: '上田', rank: '準指導員', days: 2 },
        { name: '小川', rank: '認定指導員', days: 20 },
      ],
      [{ name: '上田', date: '2027-01-12', type: 'AVOID' }],
    );
    const proposal = solveDay(context, 1);
    expect(proposal.instructorIds).toEqual(['小川']);
    expect(proposal.reviewReasons).toEqual(['認定指導員のみの構成']);
  });

  it('シーン6: 3人目がいなければ要調整の人で埋める', () => {
    const context = createContext(
      [
        { name: '青木', rank: '指導員', days: 8 },
        { name: '上田', rank: '準指導員', days: 8 },
        { name: '小川', rank: '認定指導員', days: 8 },
      ],
      [{ name: '小川', date: '2027-01-12', type: 'AVOID' }],
    );
    const proposal = solveDay(context, 3);
    expect(proposal.instructorIds).toHaveLength(3);
    expect(proposal.reviewReasons).toEqual(['要調整の勤務: 小川']);
  });

  it('シーン7: 勤務不可の人は入れず不足のまま出す', () => {
    const context = createContext(
      [
        { name: '青木', rank: '指導員', days: 8 },
        { name: '上田', rank: '準指導員', days: 8 },
        { name: '小川', rank: '認定指導員', days: 8 },
      ],
      [{ name: '青木', date: '2027-01-12', type: 'UNAVAILABLE' }],
    );
    const proposal = solveDay(context, 3);
    expect(proposal.instructorIds).toEqual(['上田', '小川'].sort());
    expect(proposal.shortage).toEqual({ count: 1, reasons: ['UNAVAILABLE: 1名'] });
  });

  it.each([
    { days: 5, worked: ['2027-01-09', '2027-01-10', '2027-01-11'], expected: '江口' },
    { days: 2, worked: ['2027-01-10', '2027-01-11'], expected: '上田' },
  ])('シーン8: 4連勤目だけを避ける（累計$days日）', ({ days, worked, expected }) => {
    const context = createContext(
      [
        { name: '上田', rank: '準指導員', days },
        { name: '江口', rank: '準指導員', days: 20 },
      ],
      [],
      [{ name: '上田', dates: worked }],
    );
    expect(solveDay(context, 1).instructorIds).toEqual([expected]);
  });

  it('シーン8: 代わりがいなければ4連勤でも入れる', () => {
    const context = createContext(
      [{ name: '上田', rank: '準指導員', days: 5 }],
      [],
      [{ name: '上田', dates: ['2027-01-09', '2027-01-10', '2027-01-11'] }],
    );
    expect(solveDay(context, 1).instructorIds).toEqual(['上田']);
  });

  it('シーン9: スキーの勤務は日数に含めず、同じ日のスキー勤務者は外す', () => {
    const staff: Staff[] = [
      { name: '上田', rank: '準指導員', days: 3 },
      { name: '江口', rank: '準指導員', days: 10 },
    ];
    const skiDates = Array.from({ length: 12 }, (_, index) =>
      new Date(Date.UTC(2026, 11, 1 + index * 2)).toISOString().slice(0, 10),
    );
    expect(
      solveDay(
        createContext(staff, [], [{ name: '上田', dates: skiDates, departmentCode: 'ski' }]),
        1,
      ).instructorIds,
    ).toEqual(['上田']);
    expect(
      solveDay(
        createContext(staff, [], [{ name: '上田', dates: ['2027-01-12'], departmentCode: 'ski' }]),
        1,
      ).instructorIds,
    ).toEqual(['江口']);
  });

  it('通し例: 成人の日を含む1週間を組む', () => {
    const context = createContext(
      [
        { name: '青木', rank: '指導員', days: 9 },
        { name: '石田', rank: '指導員', days: 6 },
        { name: '上田', rank: '準指導員', days: 8 },
        { name: '江口', rank: '準指導員', days: 5 },
        { name: '小川', rank: '認定指導員', days: 7 },
        { name: '加藤', rank: '認定指導員', days: 4 },
        { name: '木村', rank: '認定指導員', days: 3 },
      ],
      [
        ...['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'].flatMap((date) =>
          unavailable(['青木', '上田'], date),
        ),
        ...unavailable(['石田', '江口'], '2027-01-05'),
        ...unavailable(['上田', '江口', '加藤', '木村'], '2027-01-09'),
        { name: '小川', date: '2027-01-09', type: 'AVOID' },
        ...unavailable(['青木', '石田', '上田', '小川', '加藤'], '2027-01-10'),
      ],
    );
    const proposals = solve(context, 0, {
      weekdayRequiredCount: 2,
      weekendHolidayRequiredCount: 3,
      targetDates: [
        '2027-01-04',
        '2027-01-05',
        '2027-01-06',
        '2027-01-07',
        '2027-01-08',
        '2027-01-09',
        '2027-01-10',
        '2027-01-11',
      ],
    });
    expect(
      proposals.map(({ date, instructorIds, shortage, reviewReasons }) => [
        date,
        [...instructorIds].sort(),
        shortage.count,
        reviewReasons,
      ]),
    ).toEqual([
      ['2027-01-04', ['加藤', '石田'].sort(), 0, []],
      ['2027-01-05', ['加藤', '木村'].sort(), 0, ['認定指導員のみの構成']],
      ['2027-01-06', ['木村', '江口'].sort(), 0, []],
      ['2027-01-07', ['加藤', '石田'].sort(), 0, []],
      ['2027-01-08', ['木村', '江口'].sort(), 0, []],
      ['2027-01-09', ['小川', '石田', '青木'].sort(), 0, ['要調整の勤務: 小川']],
      ['2027-01-10', ['木村', '江口'].sort(), 1, []],
      ['2027-01-11', ['上田', '加藤', '木村'].sort(), 0, []],
    ]);
  });
});
