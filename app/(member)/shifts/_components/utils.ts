import type { DepartmentType } from "./types";

// シフト種別の短縮名マッピング (type-safe Record)
const SHIFT_TYPE_SHORT_MAP: Record<string, string> = {
  スキーレッスン: "レッスン",
  スノーボードレッスン: "レッスン",
  スキー検定: "検定",
  スノーボード検定: "検定",
  県連事業: "県連",
  月末イベント: "イベント",
} as const;

// 部門背景クラスのマッピング (immutable)
const DEPARTMENT_BG_CLASS_MAP = new Map<DepartmentType, string>([
  ["ski", "bg-ski-200 dark:bg-ski-800"],
  ["snowboard", "bg-snowboard-200 dark:bg-snowboard-800"],
] as const);

// 部門バッジ背景クラスのマッピング (immutable)
const DEPARTMENT_BADGE_BG_CLASS_MAP = new Map<DepartmentType, string>([
  ["ski", "bg-ski-500 dark:bg-ski-600"],
  ["snowboard", "bg-snowboard-500 dark:bg-snowboard-600"],
] as const);

/**
 * シフト種別名を短縮形に変換 (type-safe with Record)
 */
export function getShiftTypeShort(type: string): string {
  return SHIFT_TYPE_SHORT_MAP[type] ?? type;
}

/**
 * 部門タイプに応じた背景クラスを取得 (optimized with Map)
 */
export function getDepartmentBgClass(department: DepartmentType): string {
  return (
    DEPARTMENT_BG_CLASS_MAP.get(department) ?? "bg-gray-200 dark:bg-gray-800"
  );
}

/**
 * 部門タイプに応じたバッジ背景クラスを取得 (optimized with Map)
 */
export function getDepartmentBadgeBgClass(department: DepartmentType): string {
  return (
    DEPARTMENT_BADGE_BG_CLASS_MAP.get(department) ??
    "bg-gray-500 dark:bg-gray-600"
  );
}

/**
 * JSTの現在日付をYYYY-MM-DD形式で取得
 * Intl.DateTimeFormatを使用してタイムゾーンを考慮した日付取得を実現
 * サーバーがUTC、クライアントがJSTの場合のズレを回避
 */
export function getTodayDateJST(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

/**
 * 日付文字列をフォーマット（YYYY-MM-DD形式） (optimized)
 */
export function formatDate(year: number, month: number, day: number): string {
  const paddedMonth = month < 10 ? `0${month}` : month.toString();
  const paddedDay = day < 10 ? `0${day}` : day.toString();
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * 月の日数を取得 (memoized for common months)
 */
const daysInMonthCache = new Map<string, number>();

export function getDaysInMonth(year: number, month: number): number {
  const key = `${year}-${month}`;

  const cachedValue = daysInMonthCache.get(key);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const days = new Date(year, month, 0).getDate();
  daysInMonthCache.set(key, days);
  return days;
}

/**
 * 月の最初の曜日（0=日曜日）を取得 (memoized for performance)
 */
const firstDayCache = new Map<string, number>();

export function getFirstDayOfWeek(year: number, month: number): number {
  const key = `${year}-${month}`;

  const cachedValue = firstDayCache.get(key);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  firstDayCache.set(key, firstDay);
  return firstDay;
}

// Utility to clear caches if needed (for memory management)
export function clearUtilCaches(): void {
  daysInMonthCache.clear();
  firstDayCache.clear();
}
