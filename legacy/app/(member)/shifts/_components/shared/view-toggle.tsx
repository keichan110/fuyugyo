"use client";

import { Calendar, List, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewToggleProps = {
  currentView: "monthly" | "weekly";
  onViewChange: (view: "monthly" | "weekly") => void;
  isPending?: boolean;
  pendingView?: "monthly" | "weekly" | null;
};

/**
 * ビュー切り替えトグルボタン
 *
 * @description
 * 月次表示と週次表示を切り替えるトグルボタンコンポーネント。
 * ローディング状態の表示に対応し、切り替え中のフィードバックを提供します。
 *
 * @component
 * @example
 * ```tsx
 * <ViewToggle
 *   currentView="monthly"
 *   onViewChange={handleViewChange}
 *   isPending={false}
 * />
 * ```
 */
export function ViewToggle({
  currentView,
  onViewChange,
  isPending = false,
  pendingView = null,
}: ViewToggleProps) {
  const isMonthlyPending = isPending && pendingView === "monthly";
  const isWeeklyPending = isPending && pendingView === "weekly";

  return (
    <div className="flex items-center space-x-1 rounded-lg bg-muted p-1">
      <Button
        aria-busy={isMonthlyPending}
        className="flex items-center gap-2"
        disabled={isPending}
        onClick={() => {
          if (currentView === "monthly" || isPending) {
            return;
          }
          onViewChange("monthly");
        }}
        size="sm"
        variant={currentView === "monthly" ? "default" : "ghost"}
      >
        <Calendar className="h-4 w-4" />
        <span className="inline">月間</span>
        {isMonthlyPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </Button>
      <Button
        aria-busy={isWeeklyPending}
        className="flex items-center gap-2"
        disabled={isPending}
        onClick={() => {
          if (currentView === "weekly" || isPending) {
            return;
          }
          onViewChange("weekly");
        }}
        size="sm"
        variant={currentView === "weekly" ? "default" : "ghost"}
      >
        <List className="h-4 w-4" />
        <span className="inline">週間</span>
        {isWeeklyPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </Button>
    </div>
  );
}
