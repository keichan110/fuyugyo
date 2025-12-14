"use client";

import { useMemo } from "react";
import { ShiftBadge } from "@/app/(member)/shifts/_components/shared/badge";
import { cn } from "@/lib/utils";
import { WEEKDAYS } from "../../_lib/constants";
import type { DayData } from "../../_lib/types";
import { ShiftDayCard } from "../shared/day-card";
import type { BaseShiftDisplayProps, DepartmentType } from "../types";
import {
  formatDate,
  getDaysInMonth,
  getDepartmentBadgeBgClass,
  getDepartmentBgClass,
  getFirstDayOfWeek,
  getShiftTypeShort,
  getTodayDateJST,
} from "../utils";

// カレンダー関連の定数
const DAYS_PER_WEEK = 7;
const SUNDAY_INDEX = 0;
const SATURDAY_INDEX = 6;

type Department = {
  id: string;
  name: string;
  code: string;
};

interface MonthlyCalendarWithDetailsProps extends BaseShiftDisplayProps {
  /** 管理権限があるかどうか */
  canManage?: boolean;
  /** 部門一覧(管理権限がある場合に必要) */
  departments?: Department[];
}

/**
 * 月次カレンダー表示コンポーネント
 *
 * @description
 * 1ヶ月分のシフトをカレンダーグリッド形式で表示します。
 * 選択日のシフト詳細を右側(デスクトップ)または下部(モバイル)に表示します。
 * 祝日の色分け表示と曜日による色分け(土曜:青、日曜:赤)に対応しています。
 *
 * @component
 * @example
 * ```tsx
 * <MonthlyCalendarWithDetails
 *   year={2024}
 *   month={1}
 *   shiftStats={stats}
 *   isHoliday={checkHoliday}
 *   selectedDate="2024-01-15"
 *   onDateSelect={handleDateSelect}
 *   canManage={true}
 * />
 * ```
 */
export function MonthlyCalendarWithDetails({
  year,
  month,
  shiftStats,
  isHoliday: checkIsHoliday,
  selectedDate,
  onDateSelect,
  canManage = false,
  departments = [],
}: MonthlyCalendarWithDetailsProps) {
  // カレンダーのセットアップ
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  // JSTの今日の日付を取得（サーバーUTC対応）
  const todayDate = getTodayDateJST();

  // 選択された日付の週と位置を計算
  const selectedDateInfo = useMemo(() => {
    if (!selectedDate) {
      return null;
    }

    const selectedDay = Number.parseInt(selectedDate.split("-")[2] || "1", 10);
    const selectedDayIndex = selectedDay - 1;
    const totalCellIndex = firstDayOfWeek + selectedDayIndex;
    const weekIndex = Math.floor(totalCellIndex / DAYS_PER_WEEK);
    const dayInWeek = totalCellIndex % DAYS_PER_WEEK;

    return {
      weekIndex,
      dayInWeek,
      selectedDay,
      dayData: shiftStats[selectedDate] || {
        shifts: [],
        date: selectedDate,
        isHoliday: checkIsHoliday(selectedDate),
      },
    };
  }, [selectedDate, firstDayOfWeek, shiftStats, checkIsHoliday]);

  // 週ごとにセルを分割
  const weeks = useMemo(() => {
    const totalCells = firstDayOfWeek + daysInMonth;
    const weeksCount = Math.ceil(totalCells / DAYS_PER_WEEK);
    const weeksArray: Array<
      Array<{ day: number | null; date: string | null }>
    > = [];

    for (let week = 0; week < weeksCount; week++) {
      const weekCells: Array<{ day: number | null; date: string | null }> = [];

      for (let dayInWeek = 0; dayInWeek < DAYS_PER_WEEK; dayInWeek++) {
        const cellIndex = week * DAYS_PER_WEEK + dayInWeek;

        if (
          cellIndex < firstDayOfWeek ||
          cellIndex >= firstDayOfWeek + daysInMonth
        ) {
          // 空のセル
          weekCells.push({ day: null, date: null });
        } else {
          // 実際の日付
          const day = cellIndex - firstDayOfWeek + 1;
          const date = formatDate(year, month, day);
          weekCells.push({ day, date });
        }
      }

      weeksArray.push(weekCells);
    }

    return weeksArray;
  }, [year, month, firstDayOfWeek, daysInMonth]);

  const renderCalendarCell = (
    cellData: { day: number | null; date: string | null },
    cellIndex: number
  ) => {
    if (!(cellData.day && cellData.date)) {
      // 空のセル
      return (
        <div
          className="pointer-events-none opacity-30"
          key={`empty-${cellIndex}`}
        >
          <div className="day-card min-h-[120px] rounded-xl border-2 border-border bg-background p-3 shadow-lg md:min-h-[140px]" />
        </div>
      );
    }

    const { day, date } = cellData;
    const dayData = shiftStats[date];
    const isHolidayDay = checkIsHoliday(date);
    const isSelected = selectedDate === date;
    const isToday = date === todayDate;
    const isPastDate = date < todayDate;
    const hasShifts = dayData && dayData.shifts.length > 0;
    const dayOfWeekIndex = new Date(year, month - 1, day).getDay();
    const dayOfWeek = WEEKDAYS[dayOfWeekIndex];
    const isSaturday = dayOfWeekIndex === SATURDAY_INDEX;
    const isSunday = dayOfWeekIndex === SUNDAY_INDEX;

    return (
      <button
        className={cn(
          "day-card flex min-h-[120px] cursor-pointer flex-col rounded-xl border-2 p-3 shadow-lg transition-all duration-300 md:min-h-[140px]",
          "hover:-translate-y-1 hover:transform hover:shadow-xl",
          "bg-background",
          {
            "border-border hover:border-blue-400": !(isSelected || isToday),
            "-translate-y-1 transform border-blue-400 shadow-xl":
              isSelected && !isToday,
            "border-border ring-2 ring-emerald-400 dark:ring-emerald-500":
              isToday && !isSelected,
            "-translate-y-1 transform border-blue-400 shadow-xl ring-2 ring-emerald-400 dark:ring-emerald-500":
              isToday && isSelected,
            "opacity-80": !(hasShifts || isToday),
            "opacity-50": isPastDate && !isToday,
          }
        )}
        key={day}
        onClick={() => {
          // 同じ日付をクリックした場合はトグル(閉じる)
          if (isSelected) {
            onDateSelect(null);
          } else {
            onDateSelect(date);
          }
        }}
        type="button"
      >
        {/* 日付表示 */}
        <div className="mb-2 flex items-center gap-2">
          <div
            className={cn("font-bold text-lg", {
              "text-red-600 dark:text-red-400": isHolidayDay || isSunday,
              "text-blue-600 dark:text-blue-400": isSaturday,
              "text-foreground": !(isHolidayDay || isSaturday || isSunday),
            })}
          >
            {day}
          </div>
          <div className="font-medium text-muted-foreground text-xs">
            {dayOfWeek}
          </div>
          {isHolidayDay && (
            <div className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-600 text-xs dark:bg-red-950/30 dark:text-red-400">
              祝日
            </div>
          )}
        </div>

        {/* シフト詳細表示 */}
        <div className="flex flex-1 items-start justify-center">
          {hasShifts ? (
            <div className="w-full space-y-2">
              {dayData.shifts.map((shift, idx) => (
                <div
                  className={cn(
                    "relative overflow-visible rounded-lg px-2 py-2",
                    getDepartmentBgClass(shift.department as DepartmentType),
                    shift.isMyShift &&
                      "border-l-[3px] border-l-green-500 pl-1.5 dark:border-l-green-400",
                    idx > 0 && "mt-2"
                  )}
                  key={`${shift.department}-${shift.type}-${idx}`}
                >
                  <div className="flex items-center pr-4">
                    <span className="overflow-hidden whitespace-nowrap font-medium text-foreground text-xs">
                      {getShiftTypeShort(shift.type)}
                    </span>
                  </div>
                  <div className="-translate-y-1/2 absolute top-0 right-0 translate-x-1/2">
                    <ShiftBadge
                      className={getDepartmentBadgeBgClass(
                        shift.department as DepartmentType
                      )}
                      count={shift.count}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-xs">
              シフトなし
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="hidden sm:block">
      <div className="space-y-4">
        {weeks.map((week, weekIndex) => {
          // 週の最初の有効な日付をキーとして使用
          const firstValidDate = week.find((cell) => cell.date !== null)?.date;
          const weekKey = firstValidDate || `week-start-${weekIndex}`;

          return (
            <div className="space-y-4" key={weekKey}>
              {/* 週の行 */}
              <div className="grid grid-cols-7 gap-2 md:gap-2">
                {week.map((cellData, cellIndexInWeek) =>
                  renderCalendarCell(
                    cellData,
                    weekIndex * DAYS_PER_WEEK + cellIndexInWeek
                  )
                )}
              </div>

              {/* 選択された日付の詳細表示(該当する週の下に表示) */}
              {selectedDateInfo &&
                selectedDateInfo.weekIndex === weekIndex &&
                selectedDate && (
                  <div className="slide-in-from-top-2 block w-full animate-in duration-300">
                    <div className="mx-auto max-w-4xl">
                      <ShiftDayCard
                        canManage={canManage}
                        date={new Date(selectedDate)}
                        dateString={selectedDate}
                        dayData={selectedDateInfo.dayData as DayData}
                        departments={departments}
                      />
                    </div>
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
