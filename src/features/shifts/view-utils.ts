import JapaneseHolidays from 'japanese-holidays';

/**
 * 表示ビュー（週次/月次）の日付計算ユーティリティ。
 * 期間計算・整形は UTC 基準で行い、サーバー側の日付正規化（`T00:00:00.000Z`）と一致させる。
 * `todayString()` のみユーザーのローカルタイムゾーンで「今日」を返す（UI の初期値用）。
 */

/** YYYY-MM-DD を UTC 0時の Date に変換する */
export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Date を YYYY-MM-DD（UTC 基準）へ整形する */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD に days 日加算した YYYY-MM-DD を返す */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** YYYY-MM に months ヶ月加算した YYYY-MM を返す */
export function addMonths(month: string, months: number): string {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const d = new Date(Date.UTC(year, monthIndex + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 今日（ローカル）の YYYY-MM-DD を返す */
export function todayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD から YYYY-MM を取り出す */
export function toMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** 曜日ラベル（日〜土） */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** YYYY-MM-DD の曜日インデックス（0=日）を返す */
export function weekdayIndex(dateStr: string): number {
  return parseDate(dateStr).getUTCDay();
}

const MAX_DATE_CACHE_SIZE = 512;
const holidayCache = new Map<string, boolean>();
const calendarDayColorCache = new Map<string, 'red' | 'blue' | ''>();

/** YYYY-MM-DD が日本の祝日または振替休日かを判定する。 */
export function isJapaneseHoliday(dateStr: string): boolean {
  const cached = holidayCache.get(dateStr);
  if (cached !== undefined) {
    return cached;
  }

  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const isHoliday = Boolean(JapaneseHolidays.isHoliday(new Date(year, month - 1, day)));
  // LRU の更新コストをホットパスに持ち込まず、十分な日数を保持しながらメモリを有界にする。
  if (holidayCache.size >= MAX_DATE_CACHE_SIZE) {
    holidayCache.clear();
  }
  holidayCache.set(dateStr, isHoliday);
  return isHoliday;
}

/** 日本式カレンダーにおける日付文字色を返す（日曜・祝日=赤、土曜=青）。 */
export function getCalendarDayColor(dateStr: string): 'red' | 'blue' | undefined {
  const cached = calendarDayColorCache.get(dateStr);
  if (cached !== undefined) {
    return cached || undefined;
  }

  const dayIndex = weekdayIndex(dateStr);
  let color: 'red' | 'blue' | '' = '';
  if (dayIndex === 0 || isJapaneseHoliday(dateStr)) {
    color = 'red';
  } else if (dayIndex === 6) {
    color = 'blue';
  }

  // 通常のカレンダー利用では到達しない上限で一括破棄し、キャッシュヒットを Map#get 1回に保つ。
  if (calendarDayColorCache.size >= MAX_DATE_CACHE_SIZE) {
    calendarDayColorCache.clear();
  }
  calendarDayColorCache.set(dateStr, color);
  return color || undefined;
}

/** 「M/D（曜）」形式の短い日付ラベルを返す */
export function shortDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY_LABELS[d.getUTCDay()]}）`;
}
