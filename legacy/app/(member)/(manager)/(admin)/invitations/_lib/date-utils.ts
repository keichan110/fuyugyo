import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

/** 日本のタイムゾーン */
const TIMEZONE_JAPAN = "Asia/Tokyo";

/**
 * UTC日時をJSTに変換してフォーマット
 *
 * @param date - フォーマット対象の日付（UTC）
 * @param formatStr - フォーマット文字列（date-fns形式）
 * @returns JST表示の日付文字列
 *
 * @example
 * formatInJST(new Date("2024-01-01T00:00:00Z"), "yyyy年MM月dd日 HH:mm")
 * // => "2024年01月01日 09:00" (JSTは+9時間)
 */
export function formatInJST(date: Date | string, formatStr: string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const jstDate = toZonedTime(dateObj, TIMEZONE_JAPAN);
  return format(jstDate, formatStr, { locale: ja });
}

/**
 * UTC日時をJSTに変換（日付のみ、時刻なし）
 *
 * @param date - フォーマット対象の日付（UTC）
 * @returns JST表示の日付文字列（例: "2024年01月01日"）
 */
export function formatDateInJST(date: Date | string): string {
  return formatInJST(date, "yyyy年MM月dd日");
}

/**
 * UTC日時をJSTに変換（日付と時刻）
 *
 * @param date - フォーマット対象の日付（UTC）
 * @returns JST表示の日時文字列（例: "2024年01月01日 09:00"）
 */
export function formatDateTimeInJST(date: Date | string): string {
  return formatInJST(date, "yyyy年MM月dd日 HH:mm");
}
