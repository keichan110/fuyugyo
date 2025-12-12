"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { renderDepartmentSections } from "../_lib/shift-components";
import type { DayData } from "../_lib/types";
import { useShiftNavigation } from "../_lib/use-shift-navigation";
import { DepartmentSelectionPopover } from "./department-selection-popover";

type Department = {
  id: string;
  name: string;
  code: string;
};

type ShiftDayCardProps = {
  date: Date;
  dateString: string;
  dayData: DayData;
  /** 管理権限があるかどうか */
  canManage?: boolean;
  /** 部門一覧（管理権限がある場合に必要） */
  departments?: Department[];
};

// 曜日インデックス定数
const SUNDAY_INDEX = 0;
const SATURDAY_INDEX = 6;

/**
 * 1日分のシフトカードコンポーネント
 *
 * @description
 * 週次ビューで使用される1日分のシフト情報を表示するカードコンポーネント。
 * 日付情報、シフト統計、部門別のシフト詳細を表示します。
 * パフォーマンス最適化のためReact.memoを使用しています。
 *
 * @component
 */
export const ShiftDayCard = React.memo<ShiftDayCardProps>(
  function ShiftDayCardComponent({
    date,
    dateString,
    dayData,
    canManage = false,
    departments = [],
  }: ShiftDayCardProps) {
    const { navigateToShiftEdit } = useShiftNavigation();
    const [isDepartmentPopoverOpen, setIsDepartmentPopoverOpen] =
      useState(false);

    // 今日の日付を判定
    const isToday = useMemo(() => {
      const today = new Date();
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    }, [date]);

    // 部門選択後の遷移処理
    const handleDepartmentSelect = (departmentId: string) => {
      navigateToShiftEdit(dateString, departmentId);
    };

    // 設計書に基づく日付情報のメモ化
    const dateInfo = useMemo(() => {
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const dayOfWeek = date.getDay();
      return {
        dayName: dayNames[dayOfWeek],
        day: date.getDate(),
        month: date.getMonth() + 1,
        isWeekend: dayOfWeek === SUNDAY_INDEX || dayOfWeek === SATURDAY_INDEX,
        isSaturday: dayOfWeek === SATURDAY_INDEX,
        isSunday: dayOfWeek === SUNDAY_INDEX,
      };
    }, [date]);

    // 祝日かどうか
    const isHoliday = dayData.isHoliday;

    // 設計書に基づくシフト統計のメモ化
    const shiftStats = useMemo(() => {
      if (!dayData.shifts || dayData.shifts.length === 0) {
        return {
          totalCount: 0,
          departments: {
            ski: [],
            snowboard: [],
            mixed: [],
          },
        };
      }

      return {
        totalCount: dayData.shifts.reduce((sum, shift) => sum + shift.count, 0),
        departments: {
          ski: dayData.shifts.filter((s) => s.department === "ski"),
          snowboard: dayData.shifts.filter((s) => s.department === "snowboard"),
        },
      };
    }, [dayData.shifts]);

    return (
      <Card
        className={cn(
          "overflow-hidden shadow-lg transition-all duration-200 hover:shadow-xl",
          {
            "ring-2 ring-emerald-400 dark:ring-emerald-500": isToday,
          }
        )}
      >
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
          <div className="flex items-center justify-between">
            {/* 日付エリア */}
            <div className="flex items-center gap-3">
              <div
                className={cn("text-center", {
                  "text-red-600 dark:text-red-400":
                    isHoliday || dateInfo.isSunday,
                  "text-blue-600 dark:text-blue-400": dateInfo.isSaturday,
                  "text-foreground": !(
                    isHoliday ||
                    dateInfo.isSaturday ||
                    dateInfo.isSunday
                  ),
                })}
              >
                <div className="font-bold text-xl leading-none tracking-tight md:text-2xl">
                  {dateInfo.day}
                </div>
                <div className="mt-0.5 text-[0.625rem] text-muted-foreground md:text-xs">
                  {dateInfo.month}月{dateInfo.dayName}
                </div>
              </div>
              {/* 祝日表示 */}
              {isHoliday && (
                <div className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-[0.625rem] text-red-600 shadow-sm dark:bg-red-950/30 dark:text-red-400">
                  祝日
                </div>
              )}
            </div>

            {/* シフト総数 */}
            {dayData.shifts && dayData.shifts.length > 0 && (
              <div className="text-right">
                <div className="font-medium text-[0.625rem] text-muted-foreground/80">
                  総シフト数
                </div>
                <div className="font-bold text-base text-primary">
                  {shiftStats.totalCount}名
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="space-y-4">
            {dayData.shifts.length === 0 ? (
              /* シフトなしの場合 */
              <div className="rounded-xl bg-muted/30 py-12 text-center">
                <div className="text-base text-muted-foreground">
                  シフトなし
                </div>
                {canManage && departments.length > 0 && (
                  <div className="mt-6 flex justify-center">
                    <DepartmentSelectionPopover
                      departments={departments}
                      onOpenChange={setIsDepartmentPopoverOpen}
                      onSelectDepartment={handleDepartmentSelect}
                      open={isDepartmentPopoverOpen}
                    >
                      <button
                        className="flex items-center gap-2 rounded-lg border-2 border-muted-foreground/30 border-dashed bg-background px-4 py-2.5 font-medium text-muted-foreground text-sm shadow-sm transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-md"
                        onClick={() => setIsDepartmentPopoverOpen(true)}
                        type="button"
                      >
                        <span className="text-xl">+</span>
                        シフト編集
                      </button>
                    </DepartmentSelectionPopover>
                  </div>
                )}
              </div>
            ) : (
              /* シフトがある場合 - 統合版関数を使用 */
              <>
                {/* 部門別セクション表示（表示専用） */}
                {renderDepartmentSections(dayData.shifts)}

                {/* 新規追加ボタン（管理権限がある場合のみ表示） */}
                {canManage && departments.length > 0 && (
                  <div className="mt-5 flex justify-center">
                    <DepartmentSelectionPopover
                      departments={departments}
                      onOpenChange={setIsDepartmentPopoverOpen}
                      onSelectDepartment={handleDepartmentSelect}
                      open={isDepartmentPopoverOpen}
                    >
                      <button
                        className="flex items-center gap-2 rounded-lg border-2 border-muted-foreground/30 border-dashed bg-background px-4 py-2.5 font-medium text-muted-foreground text-sm shadow-sm transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-md"
                        onClick={() => setIsDepartmentPopoverOpen(true)}
                        type="button"
                      >
                        <span className="text-xl">+</span>
                        シフト編集
                      </button>
                    </DepartmentSelectionPopover>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);
