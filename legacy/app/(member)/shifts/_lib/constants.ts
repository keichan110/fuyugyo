import { isHoliday as checkJapaneseHoliday } from "japanese-holidays";

// 曜日の配列 (frozen for immutability)
export const WEEKDAYS = Object.freeze([
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const);

// 祝日判定関数 - japanese-holidaysライブラリを使用した動的判定
export const isHoliday = (date: string): boolean => {
  try {
    const dateObj = new Date(date);
    // 無効な日付の場合はfalseを返す
    if (Number.isNaN(dateObj.getTime())) {
      return false;
    }
    return Boolean(checkJapaneseHoliday(dateObj));
  } catch (_error) {
    return false;
  }
};

// 部門スタイルマッピング - frozen object for better performance
export const DEPARTMENT_STYLES = Object.freeze({
  ski: Object.freeze({
    chipClass:
      "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900",
    sectionBgClass: "bg-ski-50/50 dark:bg-ski-950/20",
    sectionBorderClass: "border-ski-200 dark:border-ski-800",
    sectionTextClass: "text-ski-900 dark:text-ski-100",
    iconColor: "text-ski-600",
    label: "Ski",
  }),
  snowboard: Object.freeze({
    chipClass:
      "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900",
    sectionBgClass: "bg-snowboard-50/50 dark:bg-snowboard-950/20",
    sectionBorderClass: "border-snowboard-200 dark:border-snowboard-800",
    sectionTextClass: "text-snowboard-900 dark:text-snowboard-100",
    iconColor: "text-snowboard-600",
    label: "Snowboard",
  }),
  mixed: Object.freeze({
    chipClass: "bg-muted text-muted-foreground hover:bg-muted/80",
    sectionBgClass: "bg-card",
    sectionBorderClass: "border-border",
    sectionTextClass: "text-foreground",
    iconColor: "text-muted-foreground",
    label: "Common",
  }),
} as const);

// 部門名のマッピング - frozen for immutability
export const DEPARTMENT_NAMES = Object.freeze({
  ski: "スキー",
  snowboard: "スノーボード",
  mixed: "共通",
} as const);

// Type definitions for better type safety
export type WeekdayType = (typeof WEEKDAYS)[number];
export type DepartmentStyleKey = keyof typeof DEPARTMENT_STYLES;
export type DepartmentNameKey = keyof typeof DEPARTMENT_NAMES;
