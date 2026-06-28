"use client";

import dynamic from "next/dynamic";
import type { BaseShiftDisplayProps } from "../types";
import { ShiftCalendarSkeleton } from "../ui/calendar-skeleton";

/**
 * 統合シフトカレンダーグリッドコンポーネントのProps型
 */
interface UnifiedShiftCalendarGridProps extends BaseShiftDisplayProps {
  /** 表示バリアント（将来の拡張用） */
  variant?: "admin" | "public";
}

// BaseShiftCalendarの動的インポート
// 管理者用・公開用で共通の実装を使用
const BaseShiftCalendar = dynamic(
  () =>
    import("../base/calendar").then((mod) => ({
      default: mod.BaseShiftCalendar,
    })),
  {
    loading: () => <ShiftCalendarSkeleton />,
    ssr: false, // カレンダーは初期レンダリング不要
  }
);

/**
 * 統合シフトカレンダーグリッドコンポーネント
 *
 * @description
 * 月次カレンダーのグリッド表示を提供するコンポーネント。
 * BaseShiftCalendarを動的にインポートし、管理者用・公開用で共通のカレンダー表示を提供します。
 * SSRを無効化し、クライアントサイドでのみレンダリングされます。
 *
 * @component
 * @example
 * ```tsx
 * <ShiftCalendarGrid
 *   year={2024}
 *   month={1}
 *   shiftStats={stats}
 *   isHoliday={checkHoliday}
 *   selectedDate="2024-01-15"
 *   onDateSelect={handleDateSelect}
 * />
 * ```
 */
export function ShiftCalendarGrid(props: UnifiedShiftCalendarGridProps) {
  // variantは将来の拡張用（現在は使用せず、BaseShiftCalendarに直接委譲）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _variant, ...baseProps } = props;

  return <BaseShiftCalendar {...baseProps} />;
}

// 型エクスポート（後方互換性のため）
export type { UnifiedShiftCalendarGridProps };
