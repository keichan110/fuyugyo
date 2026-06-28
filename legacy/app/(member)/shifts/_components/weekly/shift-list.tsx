"use client";

import { useMemo } from "react";
import type { DayData, ShiftStats } from "../../_lib/types";
import { formatDateToString, getWeekDates } from "../../_lib/week-calculations";
import { ShiftDayCard } from "../shared/day-card";

type Department = {
  id: string;
  name: string;
  code: string;
};

type WeeklyShiftListProps = {
  baseDate: Date;
  shiftStats: ShiftStats;
  isHoliday: (date: string) => boolean;
  /** 管理権限があるかどうか */
  canManage?: boolean;
  /** 部門一覧（管理権限がある場合に必要） */
  departments?: Department[];
};

/**
 * 週次シフトリスト表示コンポーネント
 *
 * @description
 * 指定された基準日を含む1週間（月曜日から日曜日）のシフトをリスト形式で表示します。
 * 各日付のシフトカードを縦に並べて表示し、日ごとのシフト詳細を確認できます。
 *
 * @component
 * @example
 * ```tsx
 * <WeeklyShiftList
 *   baseDate={new Date()}
 *   shiftStats={stats}
 *   isHoliday={checkHoliday}
 *   selectedDate="2024-01-15"
 *   onDateSelect={handleDateSelect}
 *   canManage={true}
 * />
 * ```
 */
export function WeeklyShiftList({
  baseDate,
  shiftStats,
  isHoliday,
  canManage = false,
  departments = [],
}: WeeklyShiftListProps) {
  // 週の日付データを計算
  const weekDays = useMemo(() => {
    const weekDates = getWeekDates(baseDate);
    const days: { date: Date; dateString: string; dayData: DayData }[] = [];

    for (const currentDay of weekDates) {
      const dateString = formatDateToString(currentDay);

      const dayData: DayData = {
        date: dateString,
        shifts: shiftStats[dateString]?.shifts || [],
        isHoliday: isHoliday(dateString),
      };

      days.push({
        date: currentDay,
        dateString,
        dayData,
      });
    }

    return days;
  }, [baseDate, shiftStats, isHoliday]);

  return (
    <div className="space-y-6">
      {/* 日別カードリスト */}
      <div className="space-y-4">
        {weekDays.map(({ date, dateString, dayData }) => (
          <ShiftDayCard
            canManage={canManage}
            date={date}
            dateString={dateString}
            dayData={dayData}
            departments={departments}
            key={dateString}
          />
        ))}
      </div>
    </div>
  );
}
