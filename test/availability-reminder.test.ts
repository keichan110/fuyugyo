import { describe, expect, it } from 'vitest';

import {
  getNextJstMonth,
  shouldShowAvailabilityReminder,
} from '@/features/dashboard/availability-reminder';

describe('shouldShowAvailabilityReminder', () => {
  it('日本時間の毎月20日から表示する', () => {
    expect(shouldShowAvailabilityReminder(new Date('2026-07-19T14:59:59.999Z'))).toBe(false);
    expect(shouldShowAvailabilityReminder(new Date('2026-07-19T15:00:00.000Z'))).toBe(true);
  });
});

describe('getNextJstMonth', () => {
  it('日本時間を基準に来月を返す', () => {
    expect(getNextJstMonth(new Date('2026-12-31T14:59:59.999Z'))).toBe('2027-01');
  });
});
