"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * シフトナビゲーション用カスタムフック
 *
 * @description
 * シフト編集ページへのナビゲーション機能を提供するカスタムフック。
 * returnToパラメータを含むURL構築とルーティングをカプセル化します。
 *
 * @example
 * ```tsx
 * const { navigateToShiftEdit } = useShiftNavigation();
 *
 * const handleDepartmentSelect = (departmentId: number) => {
 *   navigateToShiftEdit(dateString, departmentId);
 * };
 * ```
 */
export function useShiftNavigation() {
  const router = useRouter();

  /**
   * シフト編集ページへナビゲート
   *
   * @param dateString - 対象日付（YYYY-MM-DD形式）
   * @param departmentId - 部門ID
   */
  const navigateToShiftEdit = useCallback(
    (dateString: string, departmentId: string) => {
      // 現在のURLパラメータを取得して returnTo に含める
      const currentUrl = window.location.pathname + window.location.search;
      const returnTo = encodeURIComponent(currentUrl);
      router.push(
        `/shifts/${dateString}?department=${departmentId}&returnTo=${returnTo}`
      );
    },
    [router]
  );

  return { navigateToShiftEdit };
}
