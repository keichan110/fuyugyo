import { describe, expect, it } from 'vitest';

import {
  formatPublicationDate,
  planPublicationWindow,
  summarizePublicationChanges,
} from '../src/features/shifts/components/publication-plan';
import type { ShiftViewItem } from '../src/features/shifts/schema';

const scope: { month: string; departmentCode: 'ski'; shiftTypeId: string } = {
  month: '2027-01',
  departmentCode: 'ski',
  shiftTypeId: 'lesson',
};
const days = ['2027-01-01', '2027-01-02', '2027-01-03'];

function shift(date: string, status: 'DRAFT' | 'PUBLISHED'): ShiftViewItem {
  return {
    id: date,
    date,
    status,
    revision: 2,
    requiredCount: 1,
    description: null,
    department: { name: 'スキー', code: 'ski' },
    shiftType: { id: 'lesson', name: '一般' },
    assignedInstructors: [],
  };
}

describe('公開範囲の計画', () => {
  it('終了日を手前に戻すと後半を取り消し、前半の空枠は公開する', () => {
    const saved = new Map([['2027-01-03:lesson', shift('2027-01-03', 'PUBLISHED')]]);
    const plan = planPublicationWindow(scope, days, '2027-01-02', saved);
    expect(plan.dates.map((item) => [item.date, item.status])).toEqual([
      ['2027-01-01', 'PUBLISHED'],
      ['2027-01-02', 'PUBLISHED'],
      ['2027-01-03', 'DRAFT'],
    ]);
    expect(plan.dates[2]).toMatchObject({ expectedShiftId: '2027-01-03', expectedRevision: 2 });
    expect(summarizePublicationChanges(plan, saved)).toEqual({
      publishCount: 2,
      unpublishCount: 1,
      zeroCount: 2,
      shortCount: 0,
    });
  });

  it('全非公開では未作成枠を新規作成せず、公開中の枠だけを取り消し件数に数える', () => {
    const saved = new Map([
      ['2027-01-01:lesson', shift('2027-01-01', 'PUBLISHED')],
      ['2027-01-02:lesson', shift('2027-01-02', 'DRAFT')],
    ]);
    const plan = planPublicationWindow(scope, days, null, saved);
    expect(plan.dates.every((item) => item.status === 'DRAFT')).toBe(true);
    expect(summarizePublicationChanges(plan, saved)).toEqual({
      publishCount: 0,
      unpublishCount: 1,
      zeroCount: 0,
      shortCount: 0,
    });
  });

  it('月末までの公開では公開済みを変更件数に含めず、新たな公開の不足を示す', () => {
    const saved = new Map([
      ['2027-01-01:lesson', shift('2027-01-01', 'PUBLISHED')],
      ['2027-01-02:lesson', shift('2027-01-02', 'DRAFT')],
    ]);
    const plan = planPublicationWindow(scope, days, '2027-01-03', saved);
    expect(summarizePublicationChanges(plan, saved)).toEqual({
      publishCount: 2,
      unpublishCount: 0,
      zeroCount: 2,
      shortCount: 1,
    });
  });

  it('表示日付をyyyy/mm/ddに揃える', () => {
    expect(formatPublicationDate('2027-01-03')).toBe('2027/01/03');
  });
});
