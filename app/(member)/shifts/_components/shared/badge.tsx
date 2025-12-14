"use client";

import { cn } from "@/lib/utils";

type ShiftBadgeProps = {
  count: number;
  className?: string;
};

/**
 * シフト数表示バッジ
 *
 * @description
 * カレンダーやリストでシフトの割り当て数を表示するバッジコンポーネント。
 * インストラクター数やシフト数を視覚的に表現します。
 *
 * @component
 * @example
 * ```tsx
 * <ShiftBadge count={3} className="bg-blue-100" />
 * ```
 */
export function ShiftBadge({ count, className }: ShiftBadgeProps) {
  return (
    <span
      className={cn(
        "min-w-[1.5rem] rounded-full px-2 py-1 text-center font-bold text-white text-xs shadow-sm",
        className
      )}
    >
      {count}
    </span>
  );
}
