"use client";

import { cn } from "@/lib/utils";

export type CertificationBadgeProps = {
  /**
   * 資格の短縮名（表示されるテキスト）
   */
  shortName: string;
  /**
   * 部門コード（色分けの判定に使用）
   */
  departmentCode: string;
  /**
   * 追加のCSSクラス
   */
  className?: string;
};

/**
 * 資格バッジコンポーネント
 *
 * 部門に応じて色分けされた資格バッジを表示します。
 * - スキー部門: 青系統
 * - スノーボード部門: オレンジ系統
 *
 * @example
 * ```tsx
 * <CertificationBadge
 *   shortName="指導員"
 *   departmentCode="SKI"
 * />
 * ```
 */
export function CertificationBadge({
  shortName,
  departmentCode,
  className,
}: CertificationBadgeProps) {
  const normalizedCode = departmentCode.toLowerCase();
  const badgeClass = normalizedCode === "ski" ? "badge-ski" : "badge-snowboard";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 font-medium text-xs",
        badgeClass,
        className
      )}
    >
      {shortName}
    </span>
  );
}
