import { addMonths } from '@/features/shifts/view-utils';

/**
 * 勤務可否の確認対象月を日本時間で返す。
 * 月の20日以降は翌月分を、それより前は当月分を確認する。
 */
export function getAvailabilityReminderMonth(now: Date = new Date()): string {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}`;
  return jstNow.getUTCDate() >= 20 ? addMonths(month, 1) : month;
}
