"use client";

import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRequireAuth } from "@/app/_providers/auth";
import { Button } from "@/components/ui/button";
import { MOBILE_BREAKPOINT } from "@/constants";
import { hasManagePermission } from "@/lib/auth/permissions";
import {
  formatLocalDate,
  getTodayLocalDate,
  parseLocalDate,
} from "@/lib/utils/date";
import { isHoliday } from "../_lib/constants";
import type { ShiftStats } from "../_lib/types";
import { useShiftDataTransformation } from "../_lib/use-shift-data-transformation";
import { MonthlyCalendarWithDetails } from "./monthly/calendar-with-details";
import { ShiftMobileList } from "./shared/mobile-list";
import { ViewToggle } from "./shared/view-toggle";
import { WeekNavigation } from "./weekly/navigation";
import { WeeklyShiftList } from "./weekly/shift-list";

type ViewMode = "monthly" | "weekly";

// 正規表現は関数の外で定義（パフォーマンス最適化）
const WHITESPACE_REGEX = /\s+/;

/**
 * サーバーから取得したシフトデータの型
 * (APIレスポンス形式に合わせた型定義)
 */
type ServerShift = {
  id: string;
  date: string;
  department: {
    id: string;
    name: string;
    code: string;
  };
  shiftType: {
    id: string;
    name: string;
  };
  assignedInstructors: Array<{
    id: string;
    displayName: string;
  }>;
  stats: {
    assignedCount: number;
    hasNotes: boolean;
  };
  description: string | null;
  /** 現在のユーザーがこのシフトにアサインされているか */
  isMyShift?: boolean;
};

/**
 * サーバーから取得した部門データの型
 */
type ServerDepartment = {
  id: string;
  name: string;
  code: string;
};

type ShiftsContentProps = {
  /**
   * サーバーから取得したシフトデータ
   */
  initialShifts: ServerShift[];
  /**
   * サーバーから取得した部門一覧
   */
  initialDepartments: ServerDepartment[];
};

/**
 * シフト管理機能の最上位コンテナコンポーネント
 *
 * @description
 * シフト表示機能のメインコンテナ。月次/週次ビューの切り替え、シフトデータの状態管理、
 * シフト作成/編集モーダルの制御、日付選択とナビゲーションを担当します。
 * Server Componentから渡されたデータを受け取り、対話的な機能を提供します。
 * データの更新後は router.refresh() を呼び出してServer Componentを再実行します。
 *
 * @component
 * @example
 * ```tsx
 * <ShiftsContent
 *   initialShifts={shifts}
 *   initialDepartments={departments}
 *   shiftFormData={formData}
 * />
 * ```
 *
 * @param props.initialShifts - サーバーから取得したシフトデータ
 * @param props.initialDepartments - サーバーから取得した部門一覧
 */
export default function ShiftsContent({
  initialShifts,
  initialDepartments,
}: ShiftsContentProps) {
  const user = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 画面サイズの状態管理
  const [isMobile, setIsMobile] = useState(false);
  const [pendingView, setPendingView] = useState<ViewMode | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = hasManagePermission(user, "shifts");

  // URL paramsから現在の表示期間を取得
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const dateFromParam = searchParams.get("dateFrom");

  const now = new Date();
  const currentYear = yearParam
    ? Number.parseInt(yearParam, 10)
    : now.getFullYear();
  const currentMonth = monthParam
    ? Number.parseInt(monthParam, 10)
    : now.getMonth() + 1;
  // 週間ビューの基準日をタイムゾーン安全に取得
  const weeklyBaseDate = dateFromParam
    ? parseLocalDate(dateFromParam)
    : parseLocalDate(getTodayLocalDate());

  const { transformShiftsToStats } = useShiftDataTransformation();

  // 月間ナビゲーション（URLパラメータを更新）
  const navigateMonth = useCallback(
    (direction: number) => {
      let newMonth = currentMonth + direction;
      let newYear = currentYear;

      const MONTHS_PER_YEAR = 12;
      const FIRST_MONTH = 1;
      const LAST_MONTH = 12;

      if (newMonth > MONTHS_PER_YEAR) {
        newMonth = FIRST_MONTH;
        newYear++;
      } else if (newMonth < FIRST_MONTH) {
        newMonth = LAST_MONTH;
        newYear--;
      }

      // URLパラメータを更新してページを再読み込み
      router.push(`/shifts?view=monthly&year=${newYear}&month=${newMonth}`, {
        scroll: false,
      });
    },
    [currentMonth, currentYear, router]
  );

  // 週間ナビゲーション（URLパラメータを更新）
  const navigateWeek = useCallback(
    (direction: number) => {
      const newDate = new Date(weeklyBaseDate);
      const DAYS_PER_WEEK = 7;
      newDate.setDate(weeklyBaseDate.getDate() + direction * DAYS_PER_WEEK);
      const dateFrom = formatLocalDate(newDate);

      // URLパラメータを更新してページを再読み込み
      router.push(`/shifts?view=weekly&dateFrom=${dateFrom}`, {
        scroll: false,
      });
    },
    [weeklyBaseDate, router]
  );

  // カレンダーで日付選択（週間ビュー用）
  const handleDateSelect = useCallback(
    (date: Date) => {
      const dateFrom = formatLocalDate(date);
      router.push(`/shifts?view=weekly&dateFrom=${dateFrom}`, {
        scroll: false,
      });
    },
    [router]
  );

  // 画面サイズの監視（matchMediaでブレークポイント越え時のみ反応）
  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    );

    // 初期値設定
    setIsMobile(mediaQuery.matches);

    // ブレークポイント越え時のみイベント発火
    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // モバイルで月間ビューのURLの場合、週間ビューに同期
  // これにより、サーバーデータとクライアントUIの不一致を防ぐ
  useEffect(() => {
    // 条件を厳密にして無限ループを防止：
    // 1. モバイルである
    // 2. viewパラメータが明示的に"monthly"である
    // この2つが同時に満たされる場合のみリダイレクト
    //
    // 無限ループにならない理由:
    // - 初回: view="monthly" → 条件true → router.replace()実行
    // - 2回目: view="weekly" → 条件false → 何もしない
    // - 以降: viewが変わらない限り条件false → 安定
    if (isMobile && searchParams.get("view") === "monthly") {
      const dateFrom = getTodayLocalDate();

      // router.replace()でURLを更新（履歴を残さない）
      router.replace(`/shifts?view=weekly&dateFrom=${dateFrom}`, {
        scroll: false,
      });
    }
    // searchParamsを依存配列に含めても、条件分岐により無限ループにならない
  }, [isMobile, searchParams, router]);

  // ビューモードをisMobileとURLパラメータから計算（派生状態）
  const viewMode = useMemo<ViewMode>(() => {
    // モバイルの場合は強制的に週間ビュー
    if (isMobile) {
      return "weekly";
    }

    // デスクトップの場合はURLパラメータを尊重
    // Middlewareにより、viewパラメータがない場合は自動的に週間ビューにリダイレクトされる
    const viewParam = searchParams.get("view") as ViewMode;
    if (viewParam === "monthly") {
      return "monthly";
    }

    // デフォルトは週間ビュー（Middlewareと一致）
    return "weekly";
  }, [isMobile, searchParams]);

  // ServerShift[] を Shift[] 型に変換するアダプター
  const convertedShifts = useMemo(() => {
    return initialShifts.map((shift) => {
      // displayNameを姓名に分離（スペースで分割、失敗時は全体を姓とする）
      const nameParts = shift.assignedInstructors.map((instructor) => {
        const parts = instructor.displayName.trim().split(WHITESPACE_REGEX);
        return {
          id: instructor.id,
          lastName: parts[0] || "",
          firstName: parts[1] || "",
        };
      });

      return {
        id: shift.id,
        date: shift.date,
        departmentId: shift.department.id,
        shiftTypeId: shift.shiftType.id,
        description: shift.description,
        createdAt: "",
        updatedAt: "",
        department: {
          id: shift.department.id,
          name: shift.department.name,
          code: shift.department.code,
          createdAt: "",
          updatedAt: "",
        },
        shiftType: {
          id: shift.shiftType.id,
          name: shift.shiftType.name,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
        assignments: nameParts.map((instructor) => ({
          id: `${shift.id}-${instructor.id}`,
          shiftId: shift.id,
          instructorId: instructor.id,
          assignedAt: "",
          instructor: {
            id: instructor.id,
            lastName: instructor.lastName,
            firstName: instructor.firstName,
            status: "ACTIVE" as const,
          },
        })),
        assignedCount: shift.stats.assignedCount,
        isMyShift: shift.isMyShift,
      };
    });
  }, [initialShifts]);

  // Department型に変換
  const convertedDepartments = useMemo(
    () =>
      initialDepartments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        code: dept.code,
        createdAt: "",
        updatedAt: "",
      })),
    [initialDepartments]
  );

  const shiftStats = useMemo<ShiftStats>(
    () => transformShiftsToStats(convertedShifts, convertedDepartments),
    [convertedShifts, convertedDepartments, transformShiftsToStats]
  );

  const handleViewChange = useCallback(
    (newView: ViewMode) => {
      if (newView === viewMode) {
        return;
      }
      setPendingView(newView);
      startTransition(() => {
        // ビュー切り替え時に日付を引き継ぐ
        // URL更新後、Server Componentが適切なデータを再取得
        if (newView === "monthly") {
          // 週間 → 月間: 週間ビューの基準日の年月を月間ビューに設定
          const year = weeklyBaseDate.getFullYear();
          const month = weeklyBaseDate.getMonth() + 1;
          router.push(`/shifts?view=monthly&year=${year}&month=${month}`, {
            scroll: false,
          });
        } else if (newView === "weekly") {
          // 月間 → 週間: 月間ビューの1日を週間ビューの基準日に設定
          const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
          const dateFrom = formatLocalDate(firstDayOfMonth);
          router.push(`/shifts?view=weekly&dateFrom=${dateFrom}`, {
            scroll: false,
          });
        }
      });
    },
    [router, viewMode, weeklyBaseDate, currentYear, currentMonth]
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleMonthlyDateSelect = useCallback((date: string | null) => {
    setSelectedDate(date);
  }, []);

  // PDF印刷用ページを開く
  const handlePrintPDF = useCallback(() => {
    const url = `/shifts/print?year=${currentYear}&month=${currentMonth}`;
    window.open(url, "_blank");
  }, [currentYear, currentMonth]);

  useEffect(() => {
    if (!isPending) {
      setPendingView(null);
    }
  }, [isPending]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
        <div className="mb-6 text-center md:mb-8">
          <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
            シフト状況確認
          </h1>
          <p className="px-2 text-muted-foreground text-sm md:text-base">
            現在のシフト状況をご確認いただけます
          </p>
        </div>

        {!isMobile && (
          <div className="mb-6 flex justify-center">
            <ViewToggle
              currentView={viewMode}
              isPending={isPending}
              onViewChange={handleViewChange}
              pendingView={pendingView}
            />
          </div>
        )}

        <div className="mb-8">
          {viewMode === "monthly" ? (
            <div className="-mx-4 sticky top-20 z-40 mb-4 border-border/30 border-b px-4 backdrop-blur-sm">
              <div className="flex items-center justify-between py-3">
                <Button
                  className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md md:gap-2 md:px-4"
                  onClick={() => navigateMonth(-1)}
                  variant="outline"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden font-medium text-sm sm:inline">
                    前月
                  </span>
                </Button>

                <h2 className="font-bold text-foreground text-lg md:text-xl">
                  {currentYear}年{currentMonth}月
                </h2>

                <Button
                  className="flex touch-manipulation items-center gap-1 px-2 py-2 hover:shadow-md md:gap-2 md:px-4"
                  onClick={() => navigateMonth(1)}
                  variant="outline"
                >
                  <span className="hidden font-medium text-sm sm:inline">
                    翌月
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <WeekNavigation
              baseDate={weeklyBaseDate}
              onDateSelect={handleDateSelect}
              onNavigate={navigateWeek}
            />
          )}

          <div className="pb-8">
            {viewMode === "monthly" ? (
              <>
                <div className="hidden sm:block">
                  <MonthlyCalendarWithDetails
                    canManage={canManage}
                    departments={convertedDepartments}
                    isHoliday={isHoliday}
                    month={currentMonth}
                    onDateSelect={handleMonthlyDateSelect}
                    selectedDate={selectedDate}
                    shiftStats={shiftStats}
                    year={currentYear}
                  />
                </div>

                <div className="block px-4 sm:hidden">
                  <ShiftMobileList
                    isHoliday={isHoliday}
                    month={currentMonth}
                    onDateSelect={handleMonthlyDateSelect}
                    selectedDate={selectedDate}
                    shiftStats={shiftStats}
                    year={currentYear}
                  />
                </div>

                {/* PDF印刷リンク（月間ビューのみ） */}
                <div className="mt-8 flex justify-end">
                  <button
                    className="flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
                    onClick={handlePrintPDF}
                    type="button"
                  >
                    <Printer className="h-4 w-4" />
                    <span>印刷</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="px-4">
                <WeeklyShiftList
                  baseDate={weeklyBaseDate}
                  canManage={canManage}
                  departments={convertedDepartments}
                  isHoliday={isHoliday}
                  shiftStats={shiftStats}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
