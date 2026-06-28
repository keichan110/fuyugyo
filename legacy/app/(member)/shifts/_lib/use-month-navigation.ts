import { useCallback, useMemo, useState } from "react";
import type { ShiftQueryParams } from "./types";

// 月の定数
const MONTHS_PER_YEAR = 12;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;

/**
 * 月間ナビゲーションのカスタムフック
 */
export function useMonthNavigation(
  initialYear?: number,
  initialMonth?: number
) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(
    initialYear || now.getFullYear()
  );
  const [currentMonth, setCurrentMonth] = useState(
    initialMonth || now.getMonth() + 1
  );

  // 月間ビュー用のクエリパラメータ計算
  const monthlyQueryParams = useMemo<ShiftQueryParams>(
    () => ({
      dateFrom: `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`,
      dateTo: `${currentYear}-${String(currentMonth).padStart(2, "0")}-31`,
    }),
    [currentYear, currentMonth]
  );

  // 月ナビゲーションハンドラー
  const navigateMonth = useCallback(
    (direction: number) => {
      let newMonth = currentMonth + direction;
      let newYear = currentYear;

      if (newMonth > MONTHS_PER_YEAR) {
        newMonth = FIRST_MONTH;
        newYear++;
      } else if (newMonth < FIRST_MONTH) {
        newMonth = LAST_MONTH;
        newYear--;
      }

      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    },
    [currentMonth, currentYear]
  );

  return {
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
    monthlyQueryParams,
    navigateMonth,
  };
}
