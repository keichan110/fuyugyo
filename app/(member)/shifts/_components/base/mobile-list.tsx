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
  getShiftTypeShort,
} from "../utils";

// Constants
const SATURDAY_DAY_INDEX = 6;

export function BaseShiftMobileList({
  year,
  month,
  shiftStats,
  isHoliday: checkIsHoliday,
  selectedDate,
  onDateSelect,
}: BaseShiftDisplayProps) {
  const daysInMonth = getDaysInMonth(year, month);

  return (
    <div className="block space-y-3 sm:hidden">
      {Array.from({ length: daysInMonth }).map((_, index) => {
        const day = index + 1;
        const date = formatDate(year, month, day);
        const dayData = shiftStats[date];
        const isHolidayDay = checkIsHoliday(date);
        const isSelected = selectedDate === date;
        const hasShifts = dayData && dayData.shifts.length > 0;
        const dayOfWeekIndex = new Date(year, month - 1, day).getDay();
        const dayOfWeek = WEEKDAYS[dayOfWeekIndex];
        const isSaturday = dayOfWeekIndex === SATURDAY_DAY_INDEX;
        const isSunday = dayOfWeekIndex === 0;

        return (
          <button
            className={cn(
              "mobile-day-item cursor-pointer rounded-xl border p-4 transition-all duration-300",
              "hover:-translate-y-0.5 hover:transform hover:shadow-md",
              {
                "border-border bg-background hover:border-blue-400": !(
                  isSelected ||
                  isHolidayDay ||
                  isSaturday ||
                  isSunday
                ),
                "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30":
                  isSaturday && !isSelected,
                "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30":
                  (isHolidayDay || isSunday) && !isSelected,
                "-translate-y-0.5 transform border-blue-400 bg-blue-50 shadow-md dark:border-blue-600 dark:bg-blue-950/30":
                  isSelected,
                "opacity-60": !(
                  hasShifts ||
                  isHolidayDay ||
                  isSaturday ||
                  isSunday
                ),
              }
            )}
            key={day}
            onClick={() => {
              // 同じ日付をクリックした場合はトグル（閉じる）
              if (isSelected) {
                onDateSelect(null);
              } else {
                onDateSelect(date);
              }
            }}
            type="button"
          >
            {/* 日付ヘッダー */}
            <div className="mb-3 flex items-center gap-3">
              <div
                className={cn("font-bold text-2xl", {
                  "text-red-600 dark:text-red-400": isHolidayDay || isSunday,
                  "text-blue-600 dark:text-blue-400": isSaturday,
                  "text-foreground": !(isHolidayDay || isSaturday || isSunday),
                })}
              >
                {day}
              </div>
              <div className="text-muted-foreground text-sm">{dayOfWeek}</div>
              {isHolidayDay && (
                <div className="font-medium text-red-600 text-sm dark:text-red-400">
                  祝日
                </div>
              )}
            </div>

            {/* シフト詳細 */}
            {hasShifts ? (
              <div className="space-y-2">
                {dayData.shifts.map((shift) => (
                  <div
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2",
                      getDepartmentBgClass(shift.department as DepartmentType)
                    )}
                    key={`${date}-${shift.department}-${shift.type}`}
                  >
                    <div className="flex items-center gap-2">
                      <DepartmentIcon
                        className="h-4 w-4"
                        code={shift.department}
                      />
                      <span className="font-medium text-foreground text-sm">
                        {getShiftTypeShort(shift.type)}
                      </span>
                    </div>
                    <ShiftBadge count={shift.count} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-2 text-center text-muted-foreground text-sm">
                シフトなし
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
