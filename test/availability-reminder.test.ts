import { describe, expect, it } from 'vitest';

import { getAvailabilityReminderMonth } from '@/features/dashboard/availability-reminder';

describe('getAvailabilityReminderMonth', () => {
  it('日本時間の20日より前は当月分を返す', () => {
    expect(getAvailabilityReminderMonth(new Date('2026-07-19T14:59:59.999Z'))).toBe('2026-07');
  });

  it('日本時間の20日以降は翌月分を返す', () => {
    expect(getAvailabilityReminderMonth(new Date('2026-07-19T15:00:00.000Z'))).toBe('2026-08');
  });

  it('年をまたぐ翌月を返せる', () => {
    expect(getAvailabilityReminderMonth(new Date('2026-12-31T14:59:59.999Z'))).toBe('2027-01');
  });
});
