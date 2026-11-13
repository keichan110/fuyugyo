/** 日本時間の当日を YYYY-MM-DD で返す。 */
export function scheduleToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 勤務可否・シフトの入力上限となる、翌年の同じ月の末日を返す。 */
export function scheduleMaximumDate(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return new Date(Date.UTC(year + 1, month, 0)).toISOString().slice(0, 10);
}

/** 表示月が入力期間の未来側上限を超える場合は、上限月に収める。 */
export function clampScheduleMonth(month: string, today: string): string {
  const maximumMonth = scheduleMaximumDate(today).slice(0, 7);
  return month > maximumMonth ? maximumMonth : month;
}
