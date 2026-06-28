"use client";

import { Calendar } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DepartmentSectionOptions } from "../../_lib/shift-components";
import { renderDepartmentSections } from "../../_lib/shift-components";
import type { DayData } from "../../_lib/types";
import { useShiftNavigation } from "../../_lib/use-shift-navigation";
import { DepartmentSelectionPopover } from "./department-popover";

type Department = {
  id: string;
  name: string;
  code: string;
};

type ShiftDetailSectionProps = {
  /** 選択された日付 */
  selectedDate: string | null;
  /** 日付のシフトデータ */
  dayData: DayData | null;
  /** シフト詳細クリック時のオプション（管理機能用） */
  shiftOptions?: DepartmentSectionOptions;
  /** 部門一覧（管理機能用） */
  departments?: Department[];
  /** セクションのクラス名 */
  className?: string;
};

// 曜日インデックス定数
const SUNDAY_INDEX = 0;
const SATURDAY_INDEX = 6;

/**
 * シフト詳細表示セクションコンポーネント
 *
 * @description
 * 選択された日付のシフト詳細を表示するセクションコンポーネント。
 * 月次・週次ビューの下部に表示され、シフトタイプ、部門、担当インストラクター、
 * ノート/コメントを表示します。管理者向けの編集・作成機能にも対応しています。
 *
 * @component
 */
export function ShiftDetailSection({
  selectedDate,
  dayData,
  shiftOptions,
  departments = [],
  className,
}: ShiftDetailSectionProps) {
  const { navigateToShiftEdit } = useShiftNavigation();
  const [isDepartmentPopoverOpen, setIsDepartmentPopoverOpen] = useState(false);

  // 部門選択後の遷移処理
  const handleDepartmentSelect = (departmentId: string) => {
    if (!selectedDate) {
      return;
    }
    navigateToShiftEdit(selectedDate, departmentId);
  };

  // 日付情報をメモ化
  const dateInfo = useMemo(() => {
    if (!(selectedDate && dayData)) {
      return null;
    }

    const date = new Date(selectedDate);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayOfWeek = date.getDay();

    return {
      date,
      dayName: dayNames[dayOfWeek],
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      isWeekend: dayOfWeek === SUNDAY_INDEX || dayOfWeek === SATURDAY_INDEX,
      isSunday: dayOfWeek === SUNDAY_INDEX,
      isSaturday: dayOfWeek === SATURDAY_INDEX,
    };
  }, [selectedDate, dayData]);

  // シフト統計をメモ化
  const shiftStats = useMemo(() => {
    if (!dayData?.shifts || dayData.shifts.length === 0) {
      return { totalCount: 0, isEmpty: true };
    }

    return {
      totalCount: dayData.shifts.reduce((sum, shift) => sum + shift.count, 0),
      isEmpty: false,
    };
  }, [dayData?.shifts]);

  // 選択された日付がない場合の表示
  if (!(selectedDate && dayData && dateInfo)) {
    return (
      <Card className={cn("w-full border-dashed", className)}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <div className="font-medium text-lg">日付を選択してください</div>
          <div className="mt-1 text-sm">シフトの詳細が表示されます</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-6">
        {/* ヘッダー: 選択した日付情報 */}
        <div className="mb-6 border-border border-b pb-4">
          <div className="flex items-center gap-4">
            <div
              className={cn("text-center", {
                "text-red-600 dark:text-red-400":
                  dayData.isHoliday || dateInfo.isSunday,
                "text-blue-600 dark:text-blue-400": dateInfo.isSaturday,
                "text-foreground": !(
                  dayData.isHoliday ||
                  dateInfo.isSaturday ||
                  dateInfo.isSunday
                ),
              })}
            >
              <div className="font-bold text-3xl leading-none md:text-4xl">
                {dateInfo.day}
              </div>
              <div className="text-muted-foreground text-sm">
                {dateInfo.year}年{dateInfo.month}月{dateInfo.dayName}曜日
              </div>
            </div>

            {/* 祝日表示 */}
            {dayData.isHoliday && (
              <div className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-600 text-sm dark:bg-red-950/30 dark:text-red-400">
                祝日
              </div>
            )}

            {/* シフト総数 */}
            <div className="ml-auto text-right">
              <div className="text-muted-foreground text-sm">配置予定</div>
              <div className="font-bold text-2xl text-primary">
                {shiftStats.totalCount}名
              </div>
            </div>
          </div>
        </div>

        {/* シフト詳細またはエンプティステート */}
        <div className="space-y-4">
          {shiftStats.isEmpty ? (
            /* シフトなしの場合 */
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-4 h-16 w-16 opacity-50" />
              <div className="mb-2 font-medium text-xl">
                シフトが設定されていません
              </div>
              <div className="mb-4 text-sm">
                {shiftOptions?.clickable
                  ? "この日付でシフトを作成できます"
                  : "シフトがある日にはここに詳細が表示されます"}
              </div>

              {/* 新規作成ボタン（管理権限がある場合） */}
              {departments.length > 0 && (
                <DepartmentSelectionPopover
                  departments={departments}
                  onOpenChange={setIsDepartmentPopoverOpen}
                  onSelectDepartment={handleDepartmentSelect}
                  open={isDepartmentPopoverOpen}
                >
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    onClick={() => setIsDepartmentPopoverOpen(true)}
                    type="button"
                  >
                    <span className="text-lg">+</span>
                    新規シフト作成
                  </button>
                </DepartmentSelectionPopover>
              )}
            </div>
          ) : (
            /* シフト詳細表示 */
            <>
              <div className="mb-4">
                <h3 className="font-semibold text-foreground text-lg">
                  シフト詳細
                </h3>
                <p className="text-muted-foreground text-sm">
                  部門別のシフト配置状況を確認できます
                  {shiftOptions?.clickable && "（タップして編集）"}
                </p>
              </div>

              <div className="space-y-4">
                {renderDepartmentSections(dayData.shifts, shiftOptions)}
              </div>

              {/* 新規作成ボタン（管理権限がある場合） */}
              {departments.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <DepartmentSelectionPopover
                    departments={departments}
                    onOpenChange={setIsDepartmentPopoverOpen}
                    onSelectDepartment={handleDepartmentSelect}
                    open={isDepartmentPopoverOpen}
                  >
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-primary/50 border-dashed bg-primary/5 px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      onClick={() => setIsDepartmentPopoverOpen(true)}
                      type="button"
                    >
                      <span className="text-lg">+</span>
                      追加でシフト作成
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
