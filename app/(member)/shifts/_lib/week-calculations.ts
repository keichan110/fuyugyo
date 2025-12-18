/**
 * 週の計算に関するユーティリティ関数
 *
 * @remarks
 * このファイルは Date オブジェクトを扱う週計算のユーティリティです。
 * コアロジックは @/lib/utils/date に集約されており、このファイルはそのラッパーです。
 */

import { formatLocalDate, getWeekStartDate } from "@/lib/utils/date";

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
 * コアロジックは getWeekStartDate() に委譲しています。
 *
 * @param date - 基準となる日付
 * @returns その週の開始日
 */
export function getWeekStart(date: Date): Date {
  // コアロジックは lib/utils/date.ts に集約
  const dateString = formatLocalDate(date);
  const weekStartString = getWeekStartDate(dateString);

  // YYYY-MM-DD 形式の文字列をローカル日付の Date に変換
  const parts = weekStartString.split("-");
  const year = Number.parseInt(parts[0] ?? "0", 10);
  const month = Number.parseInt(parts[1] ?? "0", 10);
  const day = Number.parseInt(parts[2] ?? "0", 10);
  return new Date(year, month - 1, day);
}

/**
 * 指定された日付から週の開始日（月曜日）を計算
 *
 * @deprecated この関数は後方互換性のために残されています。
 * 新しいコードでは getWeekStart() を使用してください。
 *
 * @param date - 基準となる日付
 * @returns その週の開始日
 */
export function getMonday(date: Date): Date {
  return getWeekStart(date);
}

/**
 * 指定された日付から週の終了日を計算
 *
 * @remarks
 * 週の開始日から6日後を週の終了日とします。
 * WEEK_START_DAY = 1（月曜日）の場合、終了日は日曜日になります。
 *
 * @param baseDate - 基準となる日付
 * @returns その週の終了日
 */
export function getWeekEnd(baseDate: Date): Date {
  const weekStart = getWeekStart(baseDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + MONDAY_TO_SUNDAY_OFFSET);

  return weekEnd;
}

/**
 * 指定された日付から週の終了日（日曜日）を計算
 *
 * @deprecated この関数は後方互換性のために残されています。
 * 新しいコードでは getWeekEnd() を使用してください。
 *
 * @param baseDate - 基準となる日付
 * @returns その週の終了日
 */
export function getSunday(baseDate: Date): Date {
  return getWeekEnd(baseDate);
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
 * 週の期間を表示用文字列で取得（週の開始日 - 週の終了日）
 *
 * @remarks
 * WEEK_START_DAY 定数に基づいて週の開始日と終了日を計算します。
 * 例: WEEK_START_DAY = 1（月曜日）の場合、「12/29(月) - 1/4(日)」のような形式で返します。
 */
export function getWeekPeriodDisplay(baseDate: Date): string {
  const weekStart = getWeekStart(baseDate);
  const weekEnd = getWeekEnd(baseDate);

  return `${formatDateForDisplay(weekStart)} - ${formatDateForDisplay(weekEnd)}`;
}

/**
 * 指定された基準日から週の日付配列を生成（週の開始日から7日間）
 *
 * @remarks
 * WEEK_START_DAY 定数に基づいて週の開始日を計算し、そこから7日分の日付配列を返します。
 */
export function getWeekDates(baseDate: Date): Date[] {
  const weekStart = getWeekStart(baseDate);
  const dates: Date[] = [];

  for (let i = 0; i < DAYS_IN_WEEK; i++) {
    const currentDay = new Date(weekStart);
    currentDay.setDate(weekStart.getDate() + i);
    dates.push(currentDay);
  }

  return dates;
}
