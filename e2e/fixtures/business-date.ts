import { scheduleToday } from '../../src/lib/schedule-date-range.ts';

/** サーバーの過去日制限に影響されず、翌年同月の上限にも収まる翌月20日。 */
const today = scheduleToday();
const nextMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

/** 更新系の業務フローで共有する対象日。ブラウザ間の前提はテスト開始時にリセットする。 */
export const BUSINESS_DATE = `${nextMonth.toISOString().slice(0, 7)}-20`;

/** 業務フローの月間画面に設定する月。 */
export const BUSINESS_MONTH = BUSINESS_DATE.slice(0, 7);

/** 勤務可否カレンダーの日付のアクセシブル名。 */
export const BUSINESS_DATE_LABEL = `${BUSINESS_DATE.slice(0, 4)}年${Number(BUSINESS_DATE.slice(5, 7))}月20日`;
