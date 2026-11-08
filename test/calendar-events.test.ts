import { describe, expect, it } from 'vitest';

import {
  buildCalendarEvents,
  resolveAssignmentsByDay,
  type AssignmentEventPayload,
} from '@/features/shifts/components/calendar-events';
import type { StagedRequirements } from '@/features/shifts/components/requirement-stage';
import type { StagedCell } from '@/features/shifts/components/shift-manager-types';

import type { AutoAssignProposal, ShiftViewItem } from '../src/features/shifts/schema';

const TYPE = 'lesson';
const D1 = '2027-01-09';
const D2 = '2027-01-10';
const key = (date: string) => `${date}:${TYPE}`;

function shift(date: string, names: Array<[string, string]>, description: string | null = null) {
  const item: ShiftViewItem = {
    id: `shift-${date}`,
    date,
    description,
    status: 'PUBLISHED',
    revision: 0,
    requiredCount: null,
    department: { name: 'スキー', code: 'ski' },
    shiftType: { id: TYPE, name: '一般レッスン' },
    assignedInstructors: names.map(([id, displayName]) => ({ id, displayName })),
  };
  return item;
}

const noStagedCells = new Map<string, StagedCell>();
const noStagedRequirements: StagedRequirements = new Map();
const noShortage = new Map<string, AutoAssignProposal['shortage']>();

function build(
  overrides: Partial<Parameters<typeof buildCalendarEvents>[0]> & {
    required?: Array<[string, number | null]>;
  } = {},
) {
  const days = overrides.days ?? [D1];
  const shiftByCell = overrides.shiftByCell ?? new Map<string, ShiftViewItem>();
  const stagedCells = overrides.stagedCells ?? noStagedCells;
  const assignmentsByDay =
    overrides.assignmentsByDay ??
    resolveAssignmentsByDay({
      days,
      shiftTypeId: TYPE,
      shiftByCell,
      stagedCells,
      nameById: new Map(),
    });
  return buildCalendarEvents({
    days,
    shiftTypeId: TYPE,
    assignmentsByDay,
    shiftByCell,
    stagedCells,
    stagedRequirements: noStagedRequirements,
    requiredByDay: overrides.required ? new Map(overrides.required) : null,
    shortageByCell: noShortage,
    compositionByDay: null,
    ...overrides,
  });
}

function headers(events: ReturnType<typeof build>) {
  return events.flatMap((event) => {
    const payload: AssignmentEventPayload | undefined = event.payload;
    return payload?.kind === 'header' ? [payload] : [];
  });
}

describe('resolveAssignmentsByDay', () => {
  it('ステージ済みの担当者名は 保存済み Shift → nameById → ID の順で解決する', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', '保存済みの名前']])]]);
    const stagedCells = new Map<string, StagedCell>([
      [key(D1), { instructorIds: ['a', 'b', 'c'], description: '' }],
    ]);
    const result = resolveAssignmentsByDay({
      days: [D1],
      shiftTypeId: TYPE,
      shiftByCell,
      stagedCells,
      nameById: new Map([
        ['a', 'レジストリの名前'],
        ['b', 'レジストリのB'],
      ]),
    });
    expect(result.get(D1)).toEqual([
      { id: 'a', name: '保存済みの名前' },
      { id: 'b', name: 'レジストリのB' },
      { id: 'c', name: 'c' },
    ]);
  });

  it('ステージがなければ保存済み Shift の担当者を使う', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', '山田']])]]);
    const result = resolveAssignmentsByDay({
      days: [D1, D2],
      shiftTypeId: TYPE,
      shiftByCell,
      stagedCells: noStagedCells,
      nameById: new Map(),
    });
    expect(result.get(D1)).toEqual([{ id: 'a', name: '山田' }]);
    expect(result.get(D2)).toEqual([]);
  });
});

describe('buildCalendarEvents', () => {
  it('担当者イベントを日ごとに作る', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', '山田']])]]);
    const events = build({ shiftByCell });
    expect(events.filter((event) => event.payload?.kind === 'instructor')).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: `${D1}:${TYPE}:a`, title: '山田' });
  });

  it('何も表示する内容がない日はヘッダー層を作らない', () => {
    expect(headers(build({ required: [[D1, null]] }))).toEqual([]);
    expect(headers(build())).toEqual([]);
  });

  it('未保存の割り当て・必要人数のどちらでも未保存ドットの対象になる', () => {
    const stagedCells = new Map<string, StagedCell>([
      [key(D1), { instructorIds: [], description: '' }],
    ]);
    expect(headers(build({ stagedCells }))[0]).toMatchObject({ staged: true });
    const stagedRequirements: StagedRequirements = new Map([[key(D2), { requiredCount: 2 }]]);
    expect(headers(build({ days: [D1, D2], stagedRequirements }))).toMatchObject([
      { date: D2, staged: true },
    ]);
  });

  it('備考は空白のみなら無視し、ステージ済みの備考を保存済みより優先する', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', 'A']], '保存済みの備考')]]);
    expect(headers(build({ shiftByCell }))[0]?.description).toBe('保存済みの備考');
    const stagedCells = new Map<string, StagedCell>([
      [key(D1), { instructorIds: ['a'], description: '未保存の備考' }],
    ]);
    expect(headers(build({ shiftByCell, stagedCells }))[0]?.description).toBe('未保存の備考');
    const blank = new Map<string, StagedCell>([
      [key(D1), { instructorIds: [], description: '  ' }],
    ]);
    expect(headers(build({ stagedCells: blank }))[0]?.description ?? '').toBe('');
  });

  it('充足表示: 必要人数ありは配置/必要、0/0 も表示する', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', 'A']])]]);
    expect(headers(build({ shiftByCell, required: [[D1, 3]] }))[0]?.staffing).toMatchObject({
      status: 'SHORT',
      text: '1/3',
    });
    expect(headers(build({ required: [[D1, 0]] }))[0]?.staffing).toMatchObject({
      status: 'NOT_PLANNED',
      text: '0/0',
    });
  });

  it('充足表示: 未設定は配置人数だけ、配置0名なら表示しない', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', 'A']])]]);
    expect(headers(build({ shiftByCell, required: [[D1, null]] }))[0]?.staffing).toMatchObject({
      status: 'UNSET',
      text: '1',
    });
    expect(headers(build({ required: [[D1, null]] }))).toEqual([]);
  });

  it('必要人数の取得前（requiredByDay が null）は充足表示を出さない', () => {
    const shiftByCell = new Map([[key(D1), shift(D1, [['a', 'A']])]]);
    expect(headers(build({ shiftByCell }))).toEqual([
      expect.objectContaining({ staffing: null, status: 'PUBLISHED' }),
    ]);
  });

  it('不足理由は、現在も SHORT の日にだけ Tooltip へ続ける', () => {
    const shortageByCell = new Map<string, AutoAssignProposal['shortage']>([
      [key(D1), { count: 1, reasons: ['UNAVAILABLE: 1名'] }],
      [key(D2), { count: 1, reasons: ['UNAVAILABLE: 1名'] }],
    ]);
    const shiftByCell = new Map([
      [key(D1), shift(D1, [['a', 'A']])],
      [
        key(D2),
        shift(D2, [
          ['a', 'A'],
          ['b', 'B'],
        ]),
      ],
    ]);
    const result = headers(
      build({
        days: [D1, D2],
        shiftByCell,
        shortageByCell,
        required: [
          [D1, 2],
          [D2, 2],
        ],
      }),
    );
    expect(result[0]?.staffing?.tooltip).toBe('配置1名、必要2名、不足：UNAVAILABLE: 1名');
    // D2 は充足済みなので理由は付かない
    expect(result[1]?.staffing?.tooltip).toBe('配置2名、必要2名、充足');
  });

  describe('資格構成の要確認', () => {
    const review = (needsReview: boolean) =>
      new Map([
        [
          D1,
          {
            requirementUnset: false,
            rankBreakdown: [],
            qualifiedCount: 0,
            assignedCount: 0,
            outOfRequirementNames: [],
            reasons: needsReview ? ['x'] : [],
            needsReview,
          },
        ],
      ]);
    const staffingOf = (required: number | null, assigned: number, needsReview: boolean) => {
      const shiftByCell = new Map([
        [
          key(D1),
          shift(
            D1,
            Array.from({ length: assigned }, (_, i): [string, string] => [`i${i}`, `名${i}`]),
          ),
        ],
      ]);
      return headers(
        build({ shiftByCell, required: [[D1, required]], compositionByDay: review(needsReview) }),
      )[0]?.staffing;
    };

    it('不足のみなら警告アイコン', () => {
      expect(staffingOf(2, 1, false)?.icon).toBe('warning');
    });

    it('要確認のみなら警告アイコンで、説明に資格構成の確認が必要を足す', () => {
      const staffing = staffingOf(2, 2, true);
      expect(staffing?.icon).toBe('warning');
      expect(staffing?.tooltip).toBe('配置2名、必要2名、充足、資格構成の確認が必要');
    });

    it('不足と要確認の両方でも警告アイコン', () => {
      expect(staffingOf(3, 1, true)?.icon).toBe('warning');
    });

    it('どちらもなく充足なら充足アイコン', () => {
      expect(staffingOf(2, 2, false)?.icon).toBe('filled');
    });

    it('必要人数未設定でも配置があり要確認なら警告アイコン', () => {
      expect(staffingOf(null, 2, true)?.icon).toBe('warning');
    });

    it('コンテキスト未取得（null）の間は要確認を判定しない', () => {
      const shiftByCell = new Map([[key(D1), shift(D1, [['a', '山田']])]]);
      const staffing = headers(build({ shiftByCell, required: [[D1, 1]] }))[0]?.staffing;
      expect(staffing?.icon).toBe('filled');
    });
  });
});
