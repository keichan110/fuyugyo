"use client";

import { PersonSimpleSki, PersonSimpleSnowboard } from "@phosphor-icons/react";

type DepartmentIconProps = {
  code: "ski" | "snowboard" | string;
  className?: string;
};

/**
 * 部門コードに応じたアイコンを表示するコンポーネント
 *
 * @description
 * スキー部門とスノーボード部門に対応したアイコンを表示します。
 * Phosphor Iconsライブラリを使用するため、Client Componentとして実装されています。
 * 親コンポーネント（例：ShiftCard）はServer Componentのまま利用可能です。
 * 大文字・小文字を区別せずに部門コードを判定します。
 *
 * @component
 * @example
 * ```tsx
 * // スキー部門のアイコン表示
 * <DepartmentIcon code="ski" />
 *
 * // スノーボード部門のアイコン表示（カスタムサイズ）
 * <DepartmentIcon code="SNOWBOARD" className="h-6 w-6" />
 * ```
 */
export function DepartmentIcon({
  code,
  className = "h-3.5 w-3.5",
}: DepartmentIconProps) {
  const normalizedCode = code.toLowerCase();

  switch (normalizedCode) {
    case "ski":
      return (
        <PersonSimpleSki
          className={className}
          data-department="ski"
          data-testid="department-icon"
          weight="fill"
        />
      );
    case "snowboard":
      return (
        <PersonSimpleSnowboard
          className={className}
          data-department="snowboard"
          data-testid="department-icon"
          weight="fill"
        />
      );
    default:
      return null;
  }
}
