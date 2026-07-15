import { describe, expect, it } from 'vitest';

import {
  buildAvailabilityChanges,
  getDateEditability,
  stageAvailability,
} from '@/features/availabilities/editor';
import type { StagedAvailability } from '@/features/availabilities/editor';
import type { Availability } from '@/features/availabilities/schema';

describe('stageAvailability', () => {
  it('指定を解除すると、その日のステージ値を削除として扱う', () => {
    const staged = stageAvailability(
      new Map([['2026-01-10', { type: 'UNAVAILABLE', note: '私用' }]]),
      '2026-01-10',
      null,
    );

    expect(staged.get('2026-01-10')).toBeNull();
  });
});

describe('buildAvailabilityChanges', () => {
  it('保存値との差分だけを API 入力に変換する', () => {
    const saved = new Map<string, Pick<Availability, 'type' | 'note'>>([
      ['2026-01-10', { type: 'UNAVAILABLE', note: '私用' }],
      ['2026-01-11', { type: 'AVOID', note: null }],
    ]);
    const staged = new Map<string, StagedAvailability>([
      ['2026-01-10', { type: 'UNAVAILABLE', note: '通院' }],
      ['2026-01-11', null],
      ['2026-01-12', { type: 'AVOID', note: null }],
    ]);

    expect(buildAvailabilityChanges(saved, staged)).toEqual([
      { date: '2026-01-10', type: 'UNAVAILABLE', note: '通院' },
      { date: '2026-01-11', type: null },
      { date: '2026-01-12', type: 'AVOID', note: null },
    ]);
  });
});

describe('getDateEditability', () => {
  it.each([
    ['2025-11-30', '2025-12-01', [], 'season-outside'],
    ['2025-12-01', '2025-12-02', [], 'past'],
    ['2025-12-03', '2025-12-02', ['2025-12-03'], 'locked'],
    ['2025-12-03', '2025-12-02', [], 'editable'],
  ] as const)('%s を %s 時点で判定する', (date, today, lockedDates, expected) => {
    expect(getDateEditability(date, today, new Set(lockedDates))).toBe(expected);
  });
});
