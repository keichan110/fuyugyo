"use client";

import { ja } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { getWeekPeriodDisplay } from "../../_lib/week-calculations";

type WeekNavigationProps = {
  baseDate: Date;
  onNavigate: (direction: number) => void;
  onDateSelect: (date: Date) => void;
};

/**
 * 週のナビゲーションコンポーネント
 *
 * @description
 * 週次ビューで週を移動するためのナビゲーションコンポーネント。
 * 前週/次週への移動ボタンと、カレンダーピッカーによる日付選択を提供します。
 * 週の範囲（月曜日〜日曜日）を表示します。
 *
 * @component
 * @example
 * ```tsx
 * <WeekNavigation
 *   baseDate={new Date()}
 *   onNavigate={handleNavigate}
 *   onDateSelect={handleDateSelect}
 * />
 * ```
 */
export function WeekNavigation({
  baseDate,
  onNavigate,
  onDateSelect,
}: WeekNavigationProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(baseDate);
  const calendarRef = useRef<HTMLDivElement>(null);

  // 週の期間を表示用にフォーマット
  const weekPeriod = getWeekPeriodDisplay(baseDate);

  // 日付選択時の処理（即座に移動）
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      onDateSelect(date);
      setSelectedDate(date);
      setIsCalendarOpen(false);
    }
  };

  // カレンダー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    };

    if (isCalendarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCalendarOpen]);

  return (
    <div className="-mx-4 sticky top-20 z-40 mb-4 border-border/30 border-b px-4 backdrop-blur-sm">
      <div className="py-3">
        {/* モバイル用レイアウト */}
        <div className="md:hidden">
          <div className="flex items-center justify-between">
            <Button
              className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md"
              onClick={() => onNavigate(-1)}
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden font-medium text-sm sm:inline">前週</span>
            </Button>

            <div className="flex items-center gap-1">
              <h2 className="font-bold text-foreground text-lg">
                {weekPeriod}
              </h2>

              <div className="relative ml-1">
                <Button
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                  size="sm"
                  variant="ghost"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>

                {isCalendarOpen && (
                  <div
                    className="absolute top-full right-0 z-50 mt-2 rounded-md border bg-white p-3 shadow-lg"
                    ref={calendarRef}
                  >
                    <Calendar
                      captionLayout="dropdown"
                      className="rounded-md border-0"
                      fromYear={2020}
                      locale={ja}
                      mode="single"
                      onSelect={handleDateSelect}
                      selected={selectedDate}
                      showOutsideDays={true}
                      toYear={2030}
                    />
                    <div className="mt-2 flex justify-start">
                      <Button
                        className="text-muted-foreground text-xs hover:text-foreground"
                        onClick={() => handleDateSelect(new Date())}
                        size="sm"
                        variant="ghost"
                      >
                        今日
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button
              className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md"
              onClick={() => onNavigate(1)}
              variant="outline"
            >
              <span className="hidden font-medium text-sm sm:inline">来週</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* デスクトップ用レイアウト */}
        <div className="hidden md:flex md:items-center md:justify-between">
          <Button
            className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md md:gap-2 md:px-4"
            onClick={() => onNavigate(-1)}
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden font-medium text-sm sm:inline">前週</span>
          </Button>

          <div className="flex items-center gap-2">
            <h2 className="font-bold text-foreground text-lg md:text-xl">
              {weekPeriod}
            </h2>

            <div className="relative ml-2">
              <Button
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                size="sm"
                variant="ghost"
              >
                <CalendarIcon className="h-4 w-4" />
              </Button>

              {isCalendarOpen && (
                <div
                  className="absolute top-full left-0 z-50 mt-2 rounded-md border bg-white p-3 shadow-lg"
                  ref={calendarRef}
                >
                  <Calendar
                    captionLayout="dropdown"
                    className="rounded-md border-0"
                    fromYear={2020}
                    locale={ja}
                    mode="single"
                    onSelect={handleDateSelect}
                    selected={selectedDate}
                    showOutsideDays={true}
                    toYear={2030}
                  />
                  <div className="mt-2 flex justify-start">
                    <Button
                      className="text-muted-foreground text-xs hover:text-foreground"
                      onClick={() => handleDateSelect(new Date())}
                      size="sm"
                      variant="ghost"
                    >
                      今日
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button
            className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md md:gap-2 md:px-4"
            onClick={() => onNavigate(1)}
            variant="outline"
          >
            <span className="hidden font-medium text-sm sm:inline">来週</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
