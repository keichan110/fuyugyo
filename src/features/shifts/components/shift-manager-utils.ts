import { weekdayIndex } from '../view-utils';

/** 指定月に含まれる日付を YYYY-MM-DD 形式で列挙する。 */
export function monthDays(month: string): string[] {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${month}-${day}`;
  });
}

/** 指定月の最終日を YYYY-MM-DD で返す。 */
export function monthLastDate(month: string): string {
  const days = monthDays(month);
  return days.at(-1) ?? `${month}-01`;
}

/** 日付とシフト種別から月間編集セルの一意なキーを生成する。 */
export function cellKey(date: string, shiftTypeId: string): string {
  return `${date}:${shiftTypeId}`;
}

/** 月間編集セルのキーを日付とシフト種別へ分解する。 */
export function splitCellKey(key: string): [string, string] {
  const idx = key.indexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

/** YYYY-MM-DD 形式の日付に対応する日本語の曜日一文字を返す。 */
export function weekdayLabel(date: string): string {
  return ['日', '月', '火', '水', '木', '金', '土'][weekdayIndex(date)] ?? '';
}
