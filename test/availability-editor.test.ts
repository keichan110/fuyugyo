import { describe, expect, it } from 'vitest';

import {
  applyBulkAvailability,
  buildAvailabilityChanges,
  getBulkCategory,
  getDateEditability,
  planBulkAvailability,
  stageAvailability,
} from '@/features/availabilities/editor';
import type { StagedAvailability } from '@/features/availabilities/editor';
import type { Availability } from '@/features/availabilities/schema';

describe('stageAvailability', () => {
  it('指定日のステージ値を置き換え、元の Map は変更しない', () => {
    const current = new Map<string, StagedAvailability>([
      ['2026-01-10', { type: 'UNAVAILABLE', note: '私用' }],
    ]);
    const staged = stageAvailability(current, '2026-01-10', { type: 'AVAILABLE', note: '私用' });

    expect(staged.get('2026-01-10')).toEqual({ type: 'AVAILABLE', note: '私用' });
    expect(current.get('2026-01-10')).toEqual({ type: 'UNAVAILABLE', note: '私用' });
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
      ['2026-01-11', { type: 'AVAILABLE', note: null }],
      ['2026-01-12', { type: 'AVAILABLE', note: null }],
      ['2026-01-13', { type: 'AVOID', note: null }],
    ]);

    expect(buildAvailabilityChanges(saved, staged)).toEqual([
      { date: '2026-01-10', type: 'UNAVAILABLE', note: '通院' },
      { date: '2026-01-11', type: 'AVAILABLE', note: null },
      { date: '2026-01-12', type: 'AVAILABLE', note: null },
      { date: '2026-01-13', type: 'AVOID', note: null },
    ]);
  });

  it('保存値と同じ内容のステージ値は差分に含めない', () => {
    const saved = new Map<string, Pick<Availability, 'type' | 'note'>>([
      ['2026-01-10', { type: 'AVAILABLE', note: null }],
    ]);
    const staged = new Map<string, StagedAvailability>([
      ['2026-01-10', { type: 'AVAILABLE', note: null }],
    ]);

    expect(buildAvailabilityChanges(saved, staged)).toEqual([]);
  });
});

describe('getDateEditability', () => {
  it.each([
    ['2026-05-10', '2026-05-01', [], 'editable'],
    ['2025-12-01', '2025-12-02', [], 'past'],
    ['2025-12-03', '2025-12-02', ['2025-12-03'], 'locked'],
    ['2025-12-03', '2025-12-02', [], 'editable'],
  ] as const)('%s を %s 時点で判定する', (date, today, lockedDates, expected) => {
    expect(getDateEditability(date, today, new Set(lockedDates))).toBe(expected);
  });
});

describe('一括設定', () => {
  const none = () => undefined;
  const base = { month: '2026-11', today: '2026-11-01', lockedDates: new Set<string>() };

  it('平日の祝日は曜日分類ではなく祝日分類にのみ含まれる', () => {
    expect(getBulkCategory('2026-11-03')).toBe('holiday');
    const tue = planBulkAvailability({
      ...base,
      categories: new Set([2]),
      type: 'AVAILABLE',
      getCurrent: none,
    });
    expect(tue.targetDates).not.toContain('2026-11-03');
    const hol = planBulkAvailability({
      ...base,
      categories: new Set(['holiday']),
      type: 'AVAILABLE',
      getCurrent: none,
    });
    expect(hol.targetDates).toContain('2026-11-03');
  });

  it('複数分類を重複なく対象化する', () => {
    const plan = planBulkAvailability({
      ...base,
      categories: new Set([6, 0, 'holiday']),
      type: 'AVAILABLE',
      getCurrent: none,
    });
    // 2026-11: 土 7,14,21,28 / 日 1,8,15,22,29 / 祝 3,23
    expect(plan.targetDates).toEqual([
      '2026-11-01',
      '2026-11-03',
      '2026-11-07',
      '2026-11-08',
      '2026-11-14',
      '2026-11-15',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-28',
      '2026-11-29',
    ]);
  });

  it('既存希望を上書きし、同じ type は上書き件数に含めない', () => {
    const current = new Map<string, StagedAvailability>([
      ['2026-11-07', { type: 'AVOID', note: '私用' }],
      ['2026-11-14', { type: 'AVAILABLE', note: null }],
    ]);
    const getCurrent = (date: string) => current.get(date);
    const plan = planBulkAvailability({
      ...base,
      categories: new Set([6]),
      type: 'AVAILABLE',
      getCurrent,
    });
    expect(plan.targetDates).toHaveLength(4);
    expect(plan.overwriteCount).toBe(1);
    const next = applyBulkAvailability(current, plan.targetDates, 'AVAILABLE', getCurrent);
    expect(next.get('2026-11-07')).toEqual({ type: 'AVAILABLE', note: '私用' });
    expect(next.get('2026-11-21')).toEqual({ type: 'AVAILABLE', note: null });
  });

  it('過去日・locked 日を理由別に除外し、staged を変化させない', () => {
    const plan = planBulkAvailability({
      ...base,
      today: '2026-11-10',
      lockedDates: new Set(['2026-11-14']),
      categories: new Set([6]),
      type: 'UNAVAILABLE',
      getCurrent: none,
    });
    expect(plan.excluded).toEqual({ past: 1, locked: 1 });
    expect(plan.targetDates).toEqual(['2026-11-21', '2026-11-28']);
    const next = applyBulkAvailability(new Map(), plan.targetDates, 'UNAVAILABLE', none);
    expect(next.has('2026-11-07')).toBe(false);
    expect(next.has('2026-11-14')).toBe(false);
  });

  it('元の Map を変更しない', () => {
    const original = new Map<string, StagedAvailability>();
    applyBulkAvailability(original, ['2026-11-21'], 'AVOID', none);
    expect(original.size).toBe(0);
  });
});
