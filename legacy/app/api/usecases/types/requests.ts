/**
 * カレンダービュー用クエリパラメータ
 */
export type CalendarViewQueryParams = {
  from: string;
  to: string;
  departmentId?: string;
  shiftTypeId?: string;
};

/**
 * シフト編集データ用クエリパラメータ
 */
export type ShiftEditDataQueryParams = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
};
