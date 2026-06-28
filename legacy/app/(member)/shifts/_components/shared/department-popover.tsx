"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Department = {
  id: string;
  name: string;
  code: string;
};

type DepartmentSelectionPopoverProps = {
  /** Popoverの表示状態 */
  open: boolean;
  /** Popoverの表示状態変更ハンドラー */
  onOpenChange: (open: boolean) => void;
  /** 部門一覧 */
  departments: Department[];
  /** 部門選択時のハンドラー */
  onSelectDepartment: (departmentId: string) => void;
  /** トリガーボタンの子要素 */
  children: React.ReactNode;
};

/**
 * 部門選択Popover
 *
 * @description
 * 新規シフト作成時に表示される部門選択Popover。
 * ユーザーは部門を選択してからシフト作成画面に遷移する。
 */
export function DepartmentSelectionPopover({
  open,
  onOpenChange,
  departments,
  onSelectDepartment,
  children,
}: DepartmentSelectionPopoverProps) {
  const handleDepartmentSelect = (departmentId: string) => {
    onSelectDepartment(departmentId);
    onOpenChange(false);
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">部門を選択</h4>
          <p className="text-muted-foreground text-xs">
            シフトを作成する部門を選択してください
          </p>
          <div className="grid gap-2 pt-2">
            {departments.map((department) => (
              <Button
                className="justify-start"
                key={department.id}
                onClick={() => handleDepartmentSelect(department.id)}
                type="button"
                variant="outline"
              >
                {department.name}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
