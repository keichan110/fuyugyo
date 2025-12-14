"use client";

import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { ShiftBadge } from "@/app/(member)/shifts/_components/shared/badge";
import { cn } from "@/lib/utils";
import { WEEKDAYS } from "../../_lib/constants";
import type { BaseShiftDisplayProps, DepartmentType } from "../types";
import {
  formatDate,
  getDaysInMonth,
  getDepartmentBgClass,
  getFirstDayOfWeek,
  getShiftTypeShort,
} from "../utils";

const SATURDAY_DAY_INDEX = 6;

/**
 * 日付セルのクラス名を計算する関数
 */
function getDayCellClassName(params: {
  isSelected: boolean;
  isToday: boolean;
  isHolidayDay: boolean;
  isSaturday: boolean;
  isSunday: boolean;
  hasShifts: boolean;
}) {
  const { isSelected, isToday, isHolidayDay, isSaturday, isSunday, hasShifts } =
    params;

  return cn(
    "day-card flex min-h-[120px] cursor-pointer flex-col rounded-xl border-2 p-3 shadow-lg transition-all duration-300 md:min-h-[140px]",
    "hover:-translate-y-1 hover:transform hover:shadow-xl",
    {
      "border-border bg-background hover:border-blue-400": !(
        isSelected ||
        isToday ||
        isHolidayDay ||
        isSaturday ||
        isSunday
      ),
      "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30":
        isSaturday && !isSelected && !isToday,
      "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30":
        (isHolidayDay || isSunday) && !isSelected && !isToday,
      "-translate-y-1 transform border-blue-400 bg-blue-50 shadow-xl dark:border-blue-600 dark:bg-blue-950/30":
        isSelected && !isToday,
      "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-400 ring-offset-2 dark:border-emerald-500 dark:bg-emerald-950/30 dark:ring-emerald-600":
        isToday && !isSelected,
      "-translate-y-1 transform border-emerald-500 bg-emerald-100 shadow-xl ring-4 ring-emerald-400 ring-offset-2 dark:border-emerald-500 dark:bg-emerald-900/40 dark:ring-emerald-600":
        isToday && isSelected,
      "opacity-60": !(
        hasShifts ||
        isHolidayDay ||
        isSaturday ||
        isSunday ||
        isToday
      ),
    }
  );
}

/**
 * 日付テキストのクラス名を計算する関数
 */
function getDateTextClassName(params: {
  isToday: boolean;
  isHolidayDay: boolean;
  isSaturday: boolean;
  isSunday: boolean;
}) {
  const { isToday, isHolidayDay, isSaturday, isSunday } = params;

  return cn("font-bold text-lg", {
    "text-emerald-700 dark:text-emerald-400": isToday,
    "text-red-600 dark:text-red-400": (isHolidayDay || isSunday) && !isToday,
    "text-blue-600 dark:text-blue-400": isSaturday && !isToday,
    "text-foreground": !(isHolidayDay || isSaturday || isSunday || isToday),
  });
}

/**
 * 基盤シフトカレンダーコンポーネント
 *
 * @description
 * 月次カレンダーグリッドの基盤実装を提供します。
 * 日付とシフトの対応付け、曜日の色分け(土曜:青、日曜:赤)、
 * 祝日表示などのコア機能を実装しています。
 * このコンポーネントは直接使用せず、ShiftCalendarGridを通じて使用してください。
 *
 * @component
 * @internal
 */
export function BaseShiftCalendar({
  year,
  month,
  shiftStats,
  isHoliday: checkIsHoliday,
  selectedDate,
  onDateSelect,
}: BaseShiftDisplayProps) {
  // カレンダーのセットアップ
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  // 今日の日付を取得
  const today = new Date();
  const todayDate = formatDate(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );

  return (
    <div className="hidden sm:block">
      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-2 md:gap-2">
        {/* 前月の空白セル */}
        {Array.from({ length: firstDayOfWeek }, (_, i) => {
          // 空白セルに一意なキーを生成(月の前の日付として負の値を使用)
          const emptyKey = `${year}-${month}-empty-${i - firstDayOfWeek}`;
          return (
            <div className="pointer-events-none opacity-30" key={emptyKey}>
              <div className="day-card min-h-[120px] rounded-xl border-2 border-border bg-background p-3 shadow-lg md:min-h-[140px]" />
            </div>
          );
        })}

        {/* 現在の月の日付 */}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const date = formatDate(year, month, day);
          const dayData = shiftStats[date];
          const isHolidayDay = checkIsHoliday(date);
          const isSelected = selectedDate === date;
          const isToday = date === todayDate;
          const hasShifts = Boolean(dayData && dayData.shifts.length > 0);
          const dayOfWeekIndex = new Date(year, month - 1, day).getDay();
          const dayOfWeek = WEEKDAYS[dayOfWeekIndex];
          const isSaturday = dayOfWeekIndex === SATURDAY_DAY_INDEX;
          const isSunday = dayOfWeekIndex === 0;

          return (
            <button
              className={getDayCellClassName({
                isSelected,
                isToday,
                isHolidayDay,
                isSaturday,
                isSunday,
                hasShifts,
              })}
              key={day}
              onClick={() => onDateSelect(date)}
              type="button"
            >
              {/* 日付表示 */}
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={getDateTextClassName({
                    isToday,
                    isHolidayDay,
                    isSaturday,
                    isSunday,
                  })}
                >
                  {day}
                </div>
                <div className="font-medium text-muted-foreground text-xs">
                  {dayOfWeek}
                </div>
                {isToday && (
                  <div className="rounded-full bg-emerald-500 px-2 py-1 font-bold text-white text-xs shadow-md">
                    今日
                  </div>
                )}
                {isHolidayDay && !isToday && (
                  <div className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-600 text-xs dark:bg-red-950/30 dark:text-red-400">
                    祝日
                  </div>
                )}
              </div>

              {/* シフト詳細表示 */}
              <div className="flex flex-1 items-center justify-center">
                {hasShifts ? (
                  <div className="w-full space-y-1">
                    {dayData?.shifts.map((shift) => (
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-2 py-2",
                          getDepartmentBgClass(
                            shift.department as DepartmentType
                          )
                        )}
                        key={`${date}-${shift.department}-${shift.type}`}
                      >
                        <div className="flex items-center gap-2">
                          <DepartmentIcon
                            className="h-3 w-3"
                            code={shift.department}
                          />
                          <span className="font-medium text-foreground text-xs">
                            {getShiftTypeShort(shift.type)}
                          </span>
                        </div>
                        <ShiftBadge count={shift.count} />
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
        })}
      </div>
    </div>
  );
}
