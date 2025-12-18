/**
 * 週の計算に関するユーティリティ関数
 */

import { WEEK_START_DAY } from "@/lib/utils/date";

// 週の日数
const DAYS_IN_WEEK = 7;

// 月曜日から日曜日までのオフセット
const MONDAY_TO_SUNDAY_OFFSET = 6;

/**
 * 指定された日付から週の開始日を計算
 *
 * @remarks
 * WEEK_START_DAY 定数に基づいて週の開始日を計算します。
 * 週の開始曜日を変更したい場合は、@/lib/utils/date の WEEK_START_DAY 定数を変更してください。
 */
export function getMonday(date: Date): Date {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // 週の開始日までのオフセットを計算
  let offset = WEEK_START_DAY - dayOfWeek;
  if (offset > 0) {
    offset -= DAYS_IN_WEEK; // 前週の開始日
  }

  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() + offset);

  return weekStart;
}

/**
 * 指定された日付から週の終了日（日曜日）を計算
 */
export function getSunday(baseDate: Date): Date {
  const monday = getMonday(baseDate);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + MONDAY_TO_SUNDAY_OFFSET);

  return sunday;
}

/**
 * 日付を YYYY-MM-DD 形式の文字列にフォーマット
 */
export function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 日付を表示用の文字列にフォーマット（月/日(曜日)）
 */
export function formatDateForDisplay(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dayName = dayNames[date.getDay()];
  return `${m}/${d}(${dayName})`;
}

/**
 * 週の期間を表示用文字列で取得（月/日(曜日) - 月/日(曜日)）
 */
export function getWeekPeriodDisplay(baseDate: Date): string {
  const monday = getMonday(baseDate);
  const sunday = getSunday(baseDate);

  return `${formatDateForDisplay(monday)} - ${formatDateForDisplay(sunday)}`;
}

/**
 * 指定された基準日から週の日付配列を生成（月曜日から日曜日）
 */
export function getWeekDates(baseDate: Date): Date[] {
  const monday = getMonday(baseDate);
  const dates: Date[] = [];

  for (let i = 0; i < DAYS_IN_WEEK; i++) {
    const currentDay = new Date(monday);
    currentDay.setDate(monday.getDate() + i);
    dates.push(currentDay);
  }

  return dates;
}
