import { describe, expect, it } from 'vitest';

import {
  deriveStaffingStatus,
  describeStaffing,
  formatStaffingText,
  resolveInitialRequiredCount,
  summarizeStaffing,
} from '../src/features/shifts/staffing';

describe('deriveStaffingStatus', () => {
  it.each([
    [null, 0, 'UNSET'],
    [null, 3, 'UNSET'],
    [0, 0, 'NOT_PLANNED'],
    [0, 1, 'FILLED'],
    [3, 0, 'SHORT'],
    [3, 2, 'SHORT'],
    [3, 3, 'FILLED'],
    [3, 4, 'FILLED'],
  ] as const)('required=%s assigned=%s は %s', (required, assigned, expected) => {
    expect(deriveStaffingStatus(required, assigned)).toBe(expected);
  });
});

describe('表示文字列', () => {
  it('配置/必要の数字だけを返し、未設定は – を使う', () => {
    expect(formatStaffingText(3, 2)).toBe('2/3');
    expect(formatStaffingText(3, 4)).toBe('4/3');
    expect(formatStaffingText(null, 2)).toBe('2/–');
    expect(formatStaffingText(null, 0)).toBe('0/–');
    expect(formatStaffingText(0, 0)).toBe('0/0');
  });

  it('aria 用の説明に状態名を含める', () => {
    expect(describeStaffing(3, 2)).toBe('配置2名、必要3名、不足');
    expect(describeStaffing(null, 2)).toBe('配置2名、必要人数未設定');
    expect(describeStaffing(0, 0)).toBe('開講予定なし');
    expect(describeStaffing(3, 4)).toBe('配置4名、必要3名、過員');
    expect(describeStaffing(3, 3)).toBe('配置3名、必要3名、充足');
  });
});

describe('summarizeStaffing', () => {
  it('不足日数と未設定枠数を数える', () => {
    expect(
      summarizeStaffing([
        { required: 3, assigned: 1 },
        { required: 3, assigned: 0 },
        { required: 3, assigned: 3 },
        { required: null, assigned: 2 },
        { required: null, assigned: 0 },
        { required: 0, assigned: 0 },
      ]),
    ).toEqual({ shortDays: 2, unsetCount: 2 });
  });
});

describe('resolveInitialRequiredCount', () => {
  const counts = { weekday: 2, weekendHoliday: 3 };

  it('平日は weekday、土日と祝日は weekendHoliday を返す', () => {
    expect(resolveInitialRequiredCount('2027-01-12', counts)).toBe(2);
    expect(resolveInitialRequiredCount('2027-01-09', counts)).toBe(3);
    expect(resolveInitialRequiredCount('2027-01-10', counts)).toBe(3);
    // 成人の日（2027-01-11 月曜）
    expect(resolveInitialRequiredCount('2027-01-11', counts)).toBe(3);
  });
});
