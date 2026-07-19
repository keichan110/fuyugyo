import { addMonths } from '@/features/shifts/view-utils';

/** 指定時刻における日本時間の日を返す。 */
export function getJstDay(now: Date = new Date()): number {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jstNow.getUTCDate();
}

/** 指定時刻における日本時間の翌月を YYYY-MM 形式で返す。 */
export function getNextJstMonth(now: Date = new Date()): string {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}`;
  return addMonths(month, 1);
}

/** 来月分の勤務可否確認を表示する日か判定する。 */
export function shouldShowAvailabilityReminder(now: Date = new Date()): boolean {
  return getJstDay(now) >= 20;
}
