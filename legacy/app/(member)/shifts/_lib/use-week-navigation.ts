import { useCallback, useMemo, useState } from "react";
import type { ShiftQueryParams } from "./types";
import {
  formatDateToString,
  getWeekEnd,
  getWeekPeriodDisplay,
  getWeekStart,
} from "./week-calculations";

// 週の日数定数
const DAYS_PER_WEEK = 7;

/**
 * 週間ナビゲーションのカスタムフック
 */
export function useWeekNavigation(initialDate?: Date) {
  const [weeklyBaseDate, setWeeklyBaseDate] = useState(
    initialDate || new Date()
  );

  // 週間ビュー用のクエリパラメータ計算
  const weeklyQueryParams = useMemo<ShiftQueryParams>(() => {
    const weekStart = getWeekStart(weeklyBaseDate);
    const weekEnd = getWeekEnd(weeklyBaseDate);

    return {
      dateFrom: formatDateToString(weekStart),
      dateTo: formatDateToString(weekEnd),
    };
  }, [weeklyBaseDate]);

  // 週の期間表示文字列
  const weekPeriod = useMemo(
    () => getWeekPeriodDisplay(weeklyBaseDate),
    [weeklyBaseDate]
  );

  // 年月情報
  const yearMonth = useMemo(
    () => ({
      year: weeklyBaseDate.getFullYear(),
      month: weeklyBaseDate.getMonth() + 1,
    }),
    [weeklyBaseDate]
  );

  // 週間ナビゲーションハンドラー（任意の日付ベース）
  const navigateWeek = useCallback(
    (direction: number) => {
      const newDate = new Date(weeklyBaseDate);
      newDate.setDate(weeklyBaseDate.getDate() + direction * DAYS_PER_WEEK);
      setWeeklyBaseDate(newDate);
    },
    [weeklyBaseDate]
  );

  // カレンダーで日付選択ハンドラー
  const handleDateSelect = useCallback((selectedDate: Date) => {
    setWeeklyBaseDate(selectedDate);
  }, []);

  return {
    weeklyBaseDate,
    setWeeklyBaseDate,
    weeklyQueryParams,
    weekPeriod,
    yearMonth,
    navigateWeek,
    handleDateSelect,
  };
}
