"use client";

import { cn } from "@/lib/utils";
import { DEPARTMENT_STYLES } from "../_lib/constants";
import { getDepartmentIcon } from "../_lib/shift-components";
import type { DepartmentMinimal } from "../_lib/types";

type DepartmentSelectorProps = {
  departments: DepartmentMinimal[];
  selectedId: string;
  onSelect: (id: string) => void;
  error?: string | undefined;
  isLoading?: boolean;
};

/**
 * 部門選択コンポーネント
 *
 * @description
 * スキー/スノーボード部門を選択するためのボタングループコンポーネント。
 * 部門ごとのアイコンと色分けを提供し、視覚的に選択しやすいUIを実現します。
 *
 * @component
 */
export function DepartmentSelector({
  departments,
  selectedId,
  onSelect,
  error,
  isLoading = false,
}: DepartmentSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="font-medium text-sm">
        部門 <span className="text-red-500">*</span>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground text-sm">読み込み中...</div>
      ) : (
        <div className="flex gap-4">
          {departments.map((department) => {
            const departmentType = department.code.toLowerCase() as
              | "ski"
              | "snowboard";
            const styles = DEPARTMENT_STYLES[departmentType];
            const isSelected = selectedId === department.id;
            const iconElement = getDepartmentIcon(
              departmentType,
              cn("h-5 w-5", styles.iconColor)
            );

            return (
              <button
                className={cn(
                  "flex cursor-pointer items-center space-x-2 rounded-lg border p-3 transition-all duration-200 hover:bg-accent",
                  isSelected
                    ? `${styles.sectionBorderClass} ${styles.sectionBgClass}`
                    : "border-gray-200 hover:border-gray-300"
                )}
                key={department.id}
                onClick={() => onSelect(department.id)}
                type="button"
              >
                {iconElement}
                <span
                  className={cn(
                    "font-medium",
                    isSelected ? styles.sectionTextClass : "text-gray-600"
                  )}
                >
                  {department.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
