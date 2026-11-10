import { describe, expect, it } from 'vitest';

import { buildAssignmentChanges } from '../src/features/shifts/components/assignment-changes';
import type { ShiftViewItem } from '../src/features/shifts/schema';

const day = '2026-11-10';
const key = `${day}:lesson`;
const saved: ShiftViewItem = {
  id: 'shift',
  date: day,
  status: 'DRAFT',
  revision: 0,
  requiredCount: 2,
  description: '元の備考',
  department: { code: 'ski', name: 'スキー' },
  shiftType: { id: 'lesson', name: '講習' },
  assignedInstructors: [
    { id: 'a', displayName: 'A' },
    { id: 'b', displayName: 'B' },
  ],
};
const base = {
  days: [day],
  shiftByCell: new Map([[key, saved]]),
  savedRequirements: new Map([[key, 2]]),
};

describe('差分確認モーダルの集計', () => {
  it('全種別の担当者・必要人数・備考変更を同じ枠にまとめる', () => {
    const result = buildAssignmentChanges({
      ...base,
      stagedCells: new Map([
        [key, { instructorIds: ['b', 'c'], description: '変更後' }],
        [`${day}:other`, { instructorIds: ['a'], description: '' }],
      ]),
      stagedRequirements: new Map([[key, { requiredCount: 3 }]]),
    });
    expect(result).toHaveLength(2);
    expect(result.find((row) => row.key === key)).toMatchObject({
      addedIds: ['c'],
      removedIds: ['a'],
      beforeRequired: 2,
      afterRequired: 3,
      requiredChanged: true,
      beforeDescription: '元の備考',
      afterDescription: '変更後',
      descriptionChanged: true,
    });
    expect(result.find((row) => row.shiftTypeId === 'other')).toMatchObject({
      addedIds: ['a'],
      removedIds: [],
    });
  });

  it('人数の未設定・0人・解除を区別し、必要人数だけの変更も含める', () => {
    const result = buildAssignmentChanges({
      ...base,
      stagedCells: new Map(),
      stagedRequirements: new Map([
        [key, { requiredCount: null }],
        [`${day}:other`, { requiredCount: 0 }],
      ]),
    });
    expect(result.map((row) => [row.beforeRequired, row.afterRequired])).toEqual([
      [2, null],
      [null, 0],
    ]);
    expect(result.every((row) => row.addedIds.length === 0 && row.removedIds.length === 0)).toBe(
      true,
    );
  });

  it('並び替えや元に戻した値は差分に含めず、備考だけの変更は含める', () => {
    expect(
      buildAssignmentChanges({
        ...base,
        stagedCells: new Map([[key, { instructorIds: ['b', 'a'], description: '元の備考' }]]),
        stagedRequirements: new Map([[key, { requiredCount: 2 }]]),
      }),
    ).toEqual([]);
    const result = buildAssignmentChanges({
      ...base,
      stagedCells: new Map([[key, { instructorIds: ['a', 'b'], description: '' }]]),
      stagedRequirements: new Map(),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      addedIds: [],
      removedIds: [],
      descriptionChanged: true,
      afterDescription: '',
    });
  });

  it('対象月外の変更と保存後の空のステージは表示しない', () => {
    expect(
      buildAssignmentChanges({
        ...base,
        stagedCells: new Map([['2026-12-01:lesson', { instructorIds: ['c'], description: '' }]]),
        stagedRequirements: new Map(),
      }),
    ).toEqual([]);
    expect(
      buildAssignmentChanges({ ...base, stagedCells: new Map(), stagedRequirements: new Map() }),
    ).toEqual([]);
  });
});
