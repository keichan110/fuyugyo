"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotification } from "@/app/_providers/notifications";
import { DepartmentSelectionPopover } from "@/app/(member)/shifts/_components/shared/department-popover";
import {
  createShiftAction,
  deleteShiftAction,
  updateShiftAction,
} from "@/app/(member)/shifts/_lib/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { secureLog } from "@/lib/utils/logging";
import type { DayShiftData, ShiftSlot } from "../_lib/types";
import { validateShiftSlot } from "../_lib/utils";
import { AddShiftSlotButton } from "./add-shift-slot-button";
import { InstructorList } from "./instructor-list";
import { ShiftSlotCard } from "./shift-slot-card";
import { ShiftSlotEditor } from "./shift-slot-editor";

type DayShiftManagerProps = {
  initialData: DayShiftData;
};

/**
 * 1日分のシフト管理UI（メインコンポーネント）
 *
 * @description
 * シフト枠の表示・編集・削除を管理するメインUI。
 * インストラクターの選択状態も管理します。
 */
export function DayShiftManager({ initialData }: DayShiftManagerProps) {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [shiftSlots, setShiftSlots] = useState<ShiftSlot[]>(
    initialData.shiftSlots
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDepartmentPopoverOpen, setIsDepartmentPopoverOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    shiftId: string | null;
  }>({ isOpen: false, shiftId: null });

  /**
   * 新しいシフト枠を追加（部門IDを指定）
   */
  const handleAddSlot = (departmentId: string) => {
    setShiftSlots((prev) => [
      ...prev,
      {
        id: null,
        departmentId,
        shiftTypeId: "",
        description: "",
        instructorIds: [],
        isEditing: true,
        isNew: true,
      },
    ]);
  };

  /**
   * シフト枠の編集開始
   */
  const handleEditSlot = (index: number) => {
    setShiftSlots((prev) =>
      prev.map((slot, i) => ({ ...slot, isEditing: i === index }))
    );
  };

  /**
   * シフト枠の編集キャンセル
   */
  const handleCancelEdit = (index: number) => {
    const slot = shiftSlots[index];

    if (!slot) {
      return;
    }

    if (slot.isNew) {
      // 新規作成中の場合は削除
      setShiftSlots((prev) => prev.filter((_, i) => i !== index));
    } else {
      // 編集モードを解除してデータを元に戻す
      const originalSlot = initialData.shiftSlots.find((s) => s.id === slot.id);
      if (originalSlot) {
        setShiftSlots((prev) =>
          prev.map((s, i) =>
            i === index ? { ...originalSlot, isEditing: false } : s
          )
        );
      }
    }
  };

  /**
   * 新規シフト枠を作成
   */
  const createNewShift = async (slot: ShiftSlot) => {
    const result = await createShiftAction({
      date: initialData.date,
      departmentId: slot.departmentId,
      shiftTypeId: slot.shiftTypeId,
      description: slot.description,
      assignedInstructorIds: slot.instructorIds,
      force: false,
    });

    if (!result.success) {
      throw new Error(result.error || "シフトの作成に失敗しました");
    }

    showNotification("シフトを作成しました", "success");
  };

  /**
   * 既存シフト枠を更新
   */
  const updateExistingShift = async (slot: ShiftSlot) => {
    if (!slot.id) {
      throw new Error("シフトIDが不正です");
    }

    const result = await updateShiftAction(slot.id, {
      description: slot.description,
      assignedInstructorIds: slot.instructorIds,
    });

    if (!result.success) {
      throw new Error(result.error || "シフトの更新に失敗しました");
    }

    showNotification("シフトを更新しました", "success");
  };

  /**
   * シフト枠の保存
   */
  const handleSaveSlot = async (index: number) => {
    const slot = shiftSlots[index];

    if (!slot) {
      return;
    }

    // バリデーション
    const errors = validateShiftSlot(slot);
    if (errors.length > 0) {
      showNotification(errors.join("\n"), "error");
      return;
    }

    setIsSubmitting(true);

    try {
      if (slot.isNew) {
        await createNewShift(slot);
      } else {
        await updateExistingShift(slot);
      }

      // データ再取得
      router.refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "保存に失敗しました";
      showNotification(errorMessage, "error");
      secureLog("error", "Failed to save shift slot", {
        error: errorMessage,
        slotId: slot.id ?? "new",
        departmentId: slot.departmentId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * シフト枠の削除
   */
  const handleDeleteSlot = (index: number) => {
    const slot = shiftSlots[index];

    if (!slot) {
      return;
    }

    if (!slot.id) {
      // 新規作成中のものは状態から削除するだけ
      setShiftSlots((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    // 確認ダイアログを表示
    setDeleteConfirmation({ isOpen: true, shiftId: slot.id });
  };

  /**
   * シフト枠の削除実行
   */
  const executeDeleteSlot = async () => {
    if (!deleteConfirmation.shiftId) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await deleteShiftAction(deleteConfirmation.shiftId);

      if (!result.success) {
        throw new Error(result.error || "シフトの削除に失敗しました");
      }

      showNotification("シフトを削除しました", "success");
      setDeleteConfirmation({ isOpen: false, shiftId: null });
      router.refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "削除に失敗しました";
      showNotification(errorMessage, "error");
      secureLog("error", "Failed to delete shift slot", {
        error: errorMessage,
        shiftId: deleteConfirmation.shiftId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * シフト枠のシフト種別変更
   */
  const handleUpdateSlotShiftType = (index: number, shiftTypeId: string) => {
    setShiftSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, shiftTypeId } : slot))
    );
  };

  /**
   * シフト枠の備考変更
   */
  const handleUpdateSlotDescription = (index: number, description: string) => {
    setShiftSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, description } : slot))
    );
  };

  /**
   * インストラクターの選択/解除
   */
  const handleToggleInstructor = (instructorId: string) => {
    // 編集中のシフト枠を探す
    const editingIndex = shiftSlots.findIndex((slot) => slot.isEditing);

    if (editingIndex === -1) {
      showNotification("シフト枠を選択してください", "warning");
      return;
    }

    setShiftSlots((prev) =>
      prev.map((slot, i) => {
        if (i !== editingIndex) {
          return slot;
        }

        const isSelected = slot.instructorIds.includes(instructorId);
        return {
          ...slot,
          instructorIds: isSelected
            ? slot.instructorIds.filter((id) => id !== instructorId)
            : [...slot.instructorIds, instructorId],
        };
      })
    );
  };

  // 編集中のシフト枠のインストラクターID配列
  const editingSlot = shiftSlots.find((slot) => slot.isEditing);
  const selectedInstructorIds = editingSlot?.instructorIds ?? [];

  return (
    <>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* 左ペイン: シフトスロット一覧 */}
        <section className="flex-1 lg:min-w-0">
          <div className="mb-6">
            <h2 className="font-semibold text-xl tracking-tight">
              登録済みシフト
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              シフトを編集するには編集ボタンをクリックしてください
            </p>
          </div>

          <div className="space-y-3">
            {shiftSlots.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                シフトが登録されていません
              </p>
            ) : (
              shiftSlots.map((slot, index) => {
                // ユニークなキーを生成（idがある場合はそれを使用、ない場合は一時的なキーを生成）
                const uniqueKey =
                  slot.id !== null ? `slot-${slot.id}` : `new-slot-${index}`;

                return slot.isEditing ? (
                  <ShiftSlotEditor
                    departments={initialData.departments}
                    instructors={initialData.availableInstructors}
                    isSubmitting={isSubmitting}
                    key={uniqueKey}
                    onCancel={() => handleCancelEdit(index)}
                    onDescriptionChange={(description) =>
                      handleUpdateSlotDescription(index, description)
                    }
                    onSave={() => handleSaveSlot(index)}
                    onShiftTypeChange={(shiftTypeId) =>
                      handleUpdateSlotShiftType(index, shiftTypeId)
                    }
                    shiftTypes={initialData.shiftTypes}
                    slot={slot}
                  />
                ) : (
                  <ShiftSlotCard
                    departments={initialData.departments}
                    instructors={initialData.availableInstructors}
                    key={uniqueKey}
                    onDelete={() => handleDeleteSlot(index)}
                    onEdit={() => handleEditSlot(index)}
                    shiftTypes={initialData.shiftTypes}
                    slot={slot}
                  />
                );
              })
            )}

            {initialData.preselectedDepartmentId ? (
              // 部門が事前選択されている場合は直接追加
              <AddShiftSlotButton
                onAdd={() =>
                  handleAddSlot(initialData.preselectedDepartmentId as string)
                }
              />
            ) : (
              // 部門が選択されていない場合はポップオーバーで選択
              <DepartmentSelectionPopover
                departments={initialData.departments}
                onOpenChange={setIsDepartmentPopoverOpen}
                onSelectDepartment={handleAddSlot}
                open={isDepartmentPopoverOpen}
              >
                <AddShiftSlotButton
                  onAdd={() => setIsDepartmentPopoverOpen(true)}
                />
              </DepartmentSelectionPopover>
            )}
          </div>
        </section>

        {/* 右ペイン: インストラクター一覧（固定表示） */}
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-12rem)] lg:w-96 lg:shrink-0">
          <div className="lg:h-full lg:overflow-auto">
            <div className="mb-6">
              <h2 className="font-semibold text-xl tracking-tight">
                インストラクター一覧
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                シフトに配置するインストラクターを選択
              </p>
            </div>

            <InstructorList
              editingShiftId={editingSlot?.id ?? null}
              instructors={initialData.availableInstructors}
              onToggleInstructor={handleToggleInstructor}
              selectedInstructorIds={selectedInstructorIds}
              shiftSlots={shiftSlots}
            />
          </div>
        </aside>
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmation({ isOpen: false, shiftId: null });
          }
        }}
        open={deleteConfirmation.isOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              シフト枠を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              このシフト枠を削除すると、配置されているインストラクターの割り当ても解除されます。
              <br />
              この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSubmitting}
              onClick={executeDeleteSlot}
            >
              {isSubmitting ? "削除中..." : "削除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
