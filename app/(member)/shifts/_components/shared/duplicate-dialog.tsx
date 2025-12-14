"use client";

import { AlertTriangle, Calendar, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 既存シフトの型定義
export type ExistingShiftData = {
  id: string;
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  };
  shiftType: {
    id: string;
    name: string;
  };
  assignments: Array<{
    id: string;
    instructor: {
      id: string;
      lastName: string;
      firstName: string;
    };
  }>;
  assignedCount: number;
};

// 新しいシフトデータの型定義
export type NewShiftData = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description?: string;
  assignedInstructorIds: string[];
};

// ダイアログのアクション型
export type DuplicateShiftAction = "merge" | "replace" | "cancel";

type DuplicateShiftDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  existingShift: ExistingShiftData;
  newShiftData: NewShiftData;
  onAction: (action: DuplicateShiftAction) => void;
  isProcessing?: boolean;
};

export function DuplicateShiftDialog({
  isOpen,
  onClose,
  existingShift,
  newShiftData,
  onAction,
  isProcessing = false,
}: DuplicateShiftDialogProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  };

  const handleAction = (action: DuplicateShiftAction) => {
    if (isProcessing) {
      return;
    }
    onAction(action);
  };

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            重複するシフトが見つかりました
          </DialogTitle>
          <DialogDescription>
            {formatDate(existingShift.date)} の {existingShift.department.name}{" "}
            - {existingShift.shiftType.name} は既に存在します。
            どのように処理しますか？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 既存のシフト情報 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-blue-900">既存のシフト</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-blue-600" />
                <span className="text-blue-700">
                  説明: {existingShift.description || "なし"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-blue-600" />
                <span className="text-blue-700">
                  割り当て: {existingShift.assignedCount}人
                </span>
              </div>
              {existingShift.assignments.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 font-medium text-blue-600 text-xs">
                    割り当て済みインストラクター:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {existingShift.assignments.map((assignment) => (
                      <span
                        className="rounded bg-blue-100 px-2 py-1 text-blue-800 text-xs"
                        key={assignment.id}
                      >
                        {assignment.instructor.lastName}{" "}
                        {assignment.instructor.firstName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 新しいシフト情報 */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-green-900">新しいシフト</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-green-600" />
                <span className="text-green-700">
                  説明: {newShiftData.description || "なし"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-green-600" />
                <span className="text-green-700">
                  割り当て予定: {newShiftData.assignedInstructorIds.length}人
                </span>
              </div>
            </div>
          </div>

          {/* アクションの説明 */}
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="font-medium text-gray-900">選択肢:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <span className="font-medium text-blue-700">マージ</span>
                  <span className="text-gray-600">
                    : 既存のシフトに新しいインストラクター割り当てを追加
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                <div>
                  <span className="font-medium text-red-700">置換</span>
                  <span className="text-gray-600">
                    : 既存のシフトを完全に新しいデータで置き換え
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-gray-500" />
                <div>
                  <span className="font-medium text-gray-700">キャンセル</span>
                  <span className="text-gray-600">: 操作を取りやめ</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            className="flex-1 sm:flex-none"
            disabled={isProcessing}
            onClick={() => handleAction("cancel")}
            variant="outline"
          >
            キャンセル
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={isProcessing}
            onClick={() => handleAction("merge")}
            variant="secondary"
          >
            {isProcessing ? "処理中..." : "マージ"}
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={isProcessing}
            onClick={() => handleAction("replace")}
            variant="destructive"
          >
            {isProcessing ? "処理中..." : "置換"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
