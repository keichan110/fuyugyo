"use client";

import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InstructorWithAssignment, ShiftSlot } from "../_lib/types";

type InstructorListProps = {
  instructors: InstructorWithAssignment[];
  shiftSlots: ShiftSlot[];
  selectedInstructorIds: string[];
  editingShiftId: string | null;
  onToggleInstructor: (instructorId: string) => void;
};

/**
 * インストラクター一覧
 *
 * @description
 * インストラクター一覧を縦並びリスト表示し、選択可能にします。
 * 検索機能と配置状況の可視化を提供します。
 */
export function InstructorList({
  instructors,
  shiftSlots,
  selectedInstructorIds,
  editingShiftId,
  onToggleInstructor,
}: InstructorListProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // 検索フィルター
  const filteredInstructors = useMemo(() => {
    if (!searchTerm) {
      return instructors;
    }

    const term = searchTerm.toLowerCase();
    return instructors.filter(
      (instructor) =>
        instructor.displayName.toLowerCase().includes(term) ||
        instructor.displayNameKana.toLowerCase().includes(term)
    );
  }, [instructors, searchTerm]);

  // 配置状況の集計
  const stats = useMemo(() => {
    const assignedIds = new Set(
      shiftSlots.flatMap((slot) => slot.instructorIds)
    );
    const assignedCount = instructors.filter((i) =>
      assignedIds.has(i.id)
    ).length;
    const availableCount = instructors.length - assignedCount;

    return {
      available: availableCount,
      assigned: assignedCount,
      total: instructors.length,
    };
  }, [instructors, shiftSlots]);

  return (
    <div className="space-y-4">
      {/* 検索 */}
      <div className="relative">
        <MagnifyingGlass className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-11 rounded-lg border-muted pl-10 transition-all focus:border-primary"
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="名前で検索..."
          value={searchTerm}
        />
      </div>

      {/* 統計 */}
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">合計:</span>
          <span className="font-bold text-foreground text-sm">
            {stats.total}名
          </span>
        </div>
      </div>

      {/* リスト表示 */}
      <div className="space-y-2">
        {filteredInstructors.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            該当するインストラクターが見つかりません
          </p>
        ) : (
          filteredInstructors.map((instructor) => {
            const isSelected = selectedInstructorIds.includes(instructor.id);
            // 編集中のシフト以外のシフトに割り当てられているかチェック
            const otherShiftIds = instructor.assignedToShiftIds.filter(
              (id) => id !== editingShiftId
            );
            // 現在選択されていない && 他のシフトに割り当てられている場合は無効化
            const isAssignedToOtherShift =
              !isSelected && otherShiftIds.length > 0;

            return (
              <button
                className={cn(
                  "group relative w-full rounded-xl border bg-card p-4 text-left transition-all",
                  isSelected &&
                    "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20 ring-offset-1",
                  !isAssignedToOtherShift &&
                    "hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm",
                  isAssignedToOtherShift && "cursor-not-allowed opacity-50"
                )}
                disabled={isAssignedToOtherShift}
                key={instructor.id}
                onClick={() => onToggleInstructor(instructor.id)}
                type="button"
              >
                <div className="flex items-start gap-3">
                  {/* チェックボックス */}
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-input group-hover:border-primary/50"
                    )}
                  >
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 text-primary-foreground"
                        weight="bold"
                      />
                    )}
                  </div>

                  {/* 部門アイコン */}
                  <DepartmentIcon
                    className="mt-0.5 h-5 w-5 shrink-0"
                    code={instructor.departmentCode.toLowerCase()}
                  />

                  {/* インストラクター情報 */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 truncate font-semibold text-sm">
                      {instructor.displayName}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {instructor.certifications.length > 0 ? (
                        instructor.certifications.map((cert) => (
                          <span
                            className="inline-flex rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs"
                            key={cert.certificationId}
                          >
                            {cert.certificationName}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          資格情報なし
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 他のシフトに配置されている場合の表示 */}
                {isAssignedToOtherShift && (
                  <div className="mt-2 rounded-md bg-muted/80 px-2 py-1 text-muted-foreground text-xs">
                    他のシフトに配置済み
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
