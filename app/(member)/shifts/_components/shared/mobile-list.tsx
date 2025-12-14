"use client";

import { BaseShiftMobileList } from "../base/mobile-list";
import type { BaseShiftDisplayProps } from "../types";

/**
 * 統合モバイルリストコンポーネントのProps型
 * 管理者画面と公開画面で共通利用
 */
interface UnifiedShiftMobileListProps extends BaseShiftDisplayProps {
  /** バリアント（将来の拡張用） */
  variant?: "admin" | "public";
}

/**
 * モバイル向けシフトリスト表示コンポーネント
 *
 * @description
 * モバイルデバイス向けに最適化されたシフトリスト表示を提供します。
 * BaseShiftMobileListコンポーネントをラップし、管理者画面と公開画面で共通のインターフェースを提供します。
 *
 * @component
 * @example
 * ```tsx
 * <ShiftMobileList
 *   year={2024}
 *   month={1}
 *   shiftStats={stats}
 *   isHoliday={checkHoliday}
 *   selectedDate="2024-01-15"
 *   onDateSelect={handleDateSelect}
 * />
 * ```
 */
export function ShiftMobileList(props: UnifiedShiftMobileListProps) {
  return <BaseShiftMobileList {...props} />;
}
