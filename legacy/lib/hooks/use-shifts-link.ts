import { useIsMobile } from "./use-mobile";

/**
 * デバイス判定に基づいて適切なシフトページURLを返すカスタムフック
 *
 * @returns モバイルの場合は週間ビュー、デスクトップの場合は月間ビューのURL
 *
 * @example
 * ```tsx
 * const shiftsLink = useShiftsLink();
 * <Link href={shiftsLink}>シフト管理</Link>
 * ```
 */
export function useShiftsLink(): string {
  const isMobile = useIsMobile();

  return `/shifts?view=${isMobile ? "weekly" : "monthly"}`;
}
