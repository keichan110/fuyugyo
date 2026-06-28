"use client";

import { PencilSimple, Trash } from "@phosphor-icons/react";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  DepartmentMinimal,
  InstructorWithAssignment,
  ShiftSlot,
  ShiftTypeMinimal,
} from "../_lib/types";

type ShiftSlotCardProps = {
  slot: ShiftSlot;
  departments: DepartmentMinimal[];
  shiftTypes: ShiftTypeMinimal[];
  instructors: InstructorWithAssignment[];
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * シフト枠カード（通常表示）
 *
 * @description
 * 1つのシフト枠を表示するカード。
 * 部門・シフト種別・配置人数・インストラクター名・備考を表示し、
 * 編集・削除ボタンを提供します。
 */
export function ShiftSlotCard({
  slot,
  departments,
  shiftTypes,
  instructors,
  onEdit,
  onDelete,
}: ShiftSlotCardProps) {
  const department = departments.find((d) => d.id === slot.departmentId);
  const shiftType = shiftTypes.find((st) => st.id === slot.shiftTypeId);
  const assignedInstructors = instructors.filter((i) =>
    slot.instructorIds.includes(i.id)
  );

  if (!(department && shiftType)) {
    return null;
  }

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <DepartmentIcon
              className="h-5 w-5 shrink-0"
              code={department.code.toLowerCase()}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-semibold text-base">
                {department.name}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground text-sm">
                {shiftType.name}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              className="hover:bg-blue-50 hover:text-blue-600"
              onClick={onEdit}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PencilSimple className="h-4 w-4" />
            </Button>
            <Button
              className="hover:bg-red-50 hover:text-red-600"
              onClick={onDelete}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 配置人数 */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary text-xs">
            <span>配置</span>
            <span className="font-bold">{slot.instructorIds.length}</span>
            <span>名</span>
          </span>
        </div>

        {/* インストラクター一覧 */}
        {assignedInstructors.length > 0 && (
          <div className="space-y-2">
            <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              配置済み
            </div>
            <ul className="space-y-1.5">
              {assignedInstructors.map((instructor) => (
                <li
                  className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                  key={instructor.id}
                >
                  <span className="font-medium">{instructor.displayName}</span>
                  {instructor.certifications.length > 0 && (
                    <span className="text-muted-foreground text-xs">
                      (
                      {instructor.certifications
                        .map((c) => c.certificationName)
                        .join(", ")}
                      )
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 備考 */}
        {slot.description && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
            <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              備考
            </div>
            <p className="text-sm">{slot.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
