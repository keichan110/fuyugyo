"use client";

import { User } from "@phosphor-icons/react";
import type React from "react";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { cn } from "@/lib/utils";
import { DEPARTMENT_NAMES, DEPARTMENT_STYLES } from "./constants";
import { getDepartmentBgClass } from "./shift-utils";
import type { AssignedInstructor, DayData, DepartmentType } from "./types";

/**
 * インストラクターチップを生成する共通関数
 * 実際にアサインされたインストラクター情報を使用
 */
export function generateInstructorChips(
  assignedInstructors: AssignedInstructor[],
  departmentType: DepartmentType
) {
  const chipClass = DEPARTMENT_STYLES[departmentType].chipClass;

  return assignedInstructors.map((instructor) => (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs",
        chipClass
      )}
      key={instructor.id}
    >
      <User className="h-3.5 w-3.5" weight="fill" />
      {instructor.displayName}
    </div>
  ));
}

/**
 * 部門セクション作成のオプション設定
 */
export type DepartmentSectionOptions = {
  clickable?: boolean;
  onShiftClick?: (shiftType: string, departmentType: DepartmentType) => void;
  showEditButtons?: boolean;
  isLoading?: boolean;
  dateString?: string;
};

/**
 * シフトカードのスタイルクラス名を生成
 */
function getShiftCardClassName(clickable: boolean, isLoading: boolean): string {
  const baseClass =
    "rounded-xl border bg-card p-3 shadow-sm transition-all duration-200";

  if (!clickable) {
    return cn(baseClass, "border-border/60 hover:shadow-md");
  }

  return cn(baseClass, [
    "w-full cursor-pointer border-border/60 text-left",
    "hover:scale-[1.02] hover:border-primary/30 hover:bg-accent/50 hover:shadow-md",
    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
    isLoading &&
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-background disabled:hover:shadow-sm",
  ]);
}

/**
 * シフトタイプバッジのスタイルクラス名を生成
 */
function getShiftTypeBadgeClassName(
  clickable: boolean,
  styles: (typeof DEPARTMENT_STYLES)[DepartmentType],
  department: DepartmentType
): string {
  const baseClass =
    "inline-flex items-center rounded-full px-3 py-1 font-semibold text-xs shadow-sm";

  if (clickable) {
    return cn(baseClass, styles.chipClass, "pointer-events-none");
  }

  return cn(baseClass, getDepartmentBgClass(department));
}

/**
 * インストラクターチップをレンダリング
 */
function renderInstructorChips(
  instructors: AssignedInstructor[],
  departmentType: DepartmentType,
  clickable: boolean,
  styles: (typeof DEPARTMENT_STYLES)[DepartmentType]
) {
  if (clickable) {
    return instructors.map((instructor) => (
      <div
        className={cn(
          "pointer-events-none inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs",
          styles.chipClass
        )}
        key={instructor.id}
      >
        <User className="h-3.5 w-3.5" weight="fill" />
        {instructor.displayName}
      </div>
    ));
  }

  return generateInstructorChips(instructors, departmentType);
}

/**
 * シフトカードをレンダリング
 */
function renderShiftCard(
  shift: DayData["shifts"][number],
  departmentType: DepartmentType,
  styles: (typeof DEPARTMENT_STYLES)[DepartmentType],
  options: DepartmentSectionOptions
) {
  const { clickable = false, isLoading = false } = options;

  // ユニークキーを生成（部門 + シフトタイプの組み合わせ）
  const uniqueKey = `${departmentType}-${shift.type}`;

  // カード内容のレンダリング
  const cardContent = (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <div
          className={getShiftTypeBadgeClassName(
            clickable,
            styles,
            shift.department as DepartmentType
          )}
        >
          {shift.type}
        </div>
        <div className="rounded-full bg-muted/50 px-2.5 py-0.5 font-semibold text-[0.625rem] text-foreground/80">
          {shift.count}名
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shift.assignedInstructors && shift.assignedInstructors.length > 0 ? (
          renderInstructorChips(
            shift.assignedInstructors,
            departmentType,
            clickable,
            styles
          )
        ) : (
          <div className="w-full rounded-md bg-muted/30 py-1.5 text-center text-[0.625rem] text-muted-foreground">
            インストラクター未配置
          </div>
        )}
      </div>
    </>
  );

  // clickable=trueの場合はbuttonとして表示
  if (clickable && options.onShiftClick) {
    return (
      <button
        className={getShiftCardClassName(clickable, isLoading)}
        disabled={isLoading}
        key={uniqueKey}
        onClick={() => {
          options.onShiftClick?.(shift.type, departmentType);
        }}
        type="button"
      >
        {cardContent}
      </button>
    );
  }

  // clickable=falseの場合はdivとして表示
  return (
    <div className={getShiftCardClassName(false, isLoading)} key={uniqueKey}>
      {cardContent}
    </div>
  );
}

/**
 * 部門セクションを作成する統合関数
 * 表示専用（公開画面）とクリック可能（管理画面）の両方に対応
 */
export function createDepartmentSection(
  departmentType: DepartmentType,
  shifts: DayData["shifts"],
  icon: React.ReactNode,
  options: DepartmentSectionOptions = {}
) {
  const departmentName = DEPARTMENT_NAMES[departmentType];
  const styles = DEPARTMENT_STYLES[departmentType];
  const {
    sectionBgClass: bgClass,
    sectionBorderClass: borderClass,
    sectionTextClass: textClass,
  } = styles;

  const departmentShifts = shifts.filter(
    (s) => s.department === departmentType
  );

  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-3.5 shadow-sm transition-all duration-300 md:p-4",
        bgClass,
        borderClass
      )}
      key={departmentType}
    >
      <div className="md:flex md:items-start md:gap-5">
        {/* 部門ヘッダー */}
        <div className="mb-3 flex items-center gap-2.5 md:mb-0 md:w-36 md:flex-shrink-0">
          {icon}
          <div>
            <h4
              className={cn(
                "font-bold text-base tracking-tight md:text-lg",
                textClass
              )}
            >
              {departmentName}
            </h4>
            <p className="font-medium text-[0.625rem] text-muted-foreground/80 uppercase tracking-wide">
              {styles.label}
            </p>
          </div>
        </div>

        {/* シフト種類とインストラクター */}
        <div className="flex-1 space-y-2.5">
          {departmentShifts.map((shift) =>
            renderShiftCard(shift, departmentType, styles, options)
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 部門別のアイコンを取得する関数
 * @deprecated DepartmentIconコンポーネントを直接使用してください
 */
export function getDepartmentIcon(departmentCode: string, className?: string) {
  const iconClass = cn(
    "h-5 w-5",
    DEPARTMENT_STYLES[departmentCode.toLowerCase() as "ski" | "snowboard"]
      ?.iconColor || "",
    className
  );

  return <DepartmentIcon className={iconClass} code={departmentCode} />;
}

/**
 * 部門別のセクションを生成する関数（統一されたアイコン付き）
 */
export function renderDepartmentSections(
  shifts: DayData["shifts"],
  options?: DepartmentSectionOptions
) {
  const sections: React.ReactNode[] = [];

  // スキー部門
  if (shifts.filter((s) => s.department === "ski").length > 0) {
    sections.push(
      createDepartmentSection("ski", shifts, getDepartmentIcon("SKI"), options)
    );
  }

  // スノーボード部門
  if (shifts.filter((s) => s.department === "snowboard").length > 0) {
    sections.push(
      createDepartmentSection(
        "snowboard",
        shifts,
        getDepartmentIcon("SNOWBOARD"),
        options
      )
    );
  }

  return sections;
}
