import { describe, expect, it } from 'vitest';

import { assignmentConflictLabels } from '../src/features/shifts/components/assignment-conflicts';

const input: Parameters<typeof assignmentConflictLabels>[0] = {
  selectedCell: { date: '2026-11-17', shiftTypeId: 'general' },
  departmentCode: 'ski',
  shiftTypes: [
    { id: 'general', name: '一般レッスン' },
    { id: 'group', name: '団体レッスン' },
  ],
  stagedCells: new Map(),
  savedShifts: [
    {
      date: '2026-11-17',
      department: { code: 'ski', name: 'スキー' },
      shiftType: { id: 'general', name: '一般レッスン' },
      assignedInstructors: [{ id: 'selected', displayName: '選択枠の人' }],
    },
    {
      date: '2026-11-17',
      department: { code: 'ski', name: 'スキー' },
      shiftType: { id: 'group', name: '団体レッスン' },
      assignedInstructors: [{ id: 'other', displayName: '別枠の人' }],
    },
    {
      date: '2026-11-17',
      department: { code: 'snowboard', name: 'スノーボード' },
      shiftType: { id: 'general', name: '一般レッスン' },
      assignedInstructors: [{ id: 'cross', displayName: '別部門の人' }],
    },
    {
      date: '2026-11-18',
      department: { code: 'ski', name: 'スキー' },
      shiftType: { id: 'group', name: '団体レッスン' },
      assignedInstructors: [{ id: 'tomorrow', displayName: '別日の人' }],
    },
  ],
};

describe('同日他枠の競合先表示', () => {
  it('選択中の枠と別日は除外し、同日別種別・別部門の配置を表示する', () => {
    expect([...assignmentConflictLabels(input)]).toEqual([
      ['other', 'スキー / 団体レッスン'],
      ['cross', 'スノーボード / 一般レッスン'],
    ]);
  });

  it('未保存の追加と全解除が保存済み配置を上書きする', () => {
    const stagedCells = new Map([['2026-11-17:group', { instructorIds: ['new'] }]]);
    const labels = assignmentConflictLabels({ ...input, stagedCells });
    expect(labels.has('other')).toBe(false);
    expect(labels.get('new')).toBe('スキー / 団体レッスン');
    stagedCells.set('2026-11-17:group', { instructorIds: [] });
    expect([...assignmentConflictLabels({ ...input, stagedCells })]).toEqual([
      ['cross', 'スノーボード / 一般レッスン'],
    ]);
  });
});
