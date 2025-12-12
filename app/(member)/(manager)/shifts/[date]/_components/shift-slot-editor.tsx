"use client";

import { DEPARTMENT_STYLES } from "@/app/(member)/shifts/_lib/constants";
import { getDepartmentIcon } from "@/app/(member)/shifts/_lib/shift-components";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  DepartmentMinimal,
  InstructorWithAssignment,
  ShiftSlot,
  ShiftTypeMinimal,
} from "../_lib/types";

type ShiftSlotEditorProps = {
  slot: ShiftSlot;
  departments: DepartmentMinimal[];
  shiftTypes: ShiftTypeMinimal[];
  instructors: InstructorWithAssignment[];
  isSubmitting: boolean;
  onShiftTypeChange: (shiftTypeId: string) => void;
  onDescriptionChange: (description: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * シフト枠エディター（編集モード）
 *
 * @description
 * シフト枠の編集フォーム。
 * 新規作成時は部門・シフト種別を選択可能、既存シフト編集時は変更不可。
 * 備考を編集し、インストラクターは下部のグリッドから選択します。
 */
export function ShiftSlotEditor({
  slot,
  departments,
  shiftTypes,
  instructors,
  isSubmitting,
  onShiftTypeChange,
  onDescriptionChange,
  onSave,
  onCancel,
}: ShiftSlotEditorProps) {
  const selectedInstructors = instructors.filter((i) =>
    slot.instructorIds.includes(i.id)
  );

  // 既存シフトの場合、部門とシフト種別を取得
  const selectedDepartment = departments.find(
    (d) => d.id === slot.departmentId
  );
  const selectedShiftType = shiftTypes.find((t) => t.id === slot.shiftTypeId);

  // 部門スタイルを事前計算
  const departmentType = selectedDepartment?.code.toLowerCase() as
    | "ski"
    | "snowboard"
    | undefined;
  const departmentStyles = departmentType
    ? DEPARTMENT_STYLES[departmentType]
    : undefined;

  return (
    <Card className="border-primary">
      <CardHeader>
        <span className="font-medium text-sm">
          {slot.isNew ? "シフト枠を作成" : "シフト枠を編集"}
        </span>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 部門選択（選択済み部門のみ表示） */}
          <div className="space-y-3">
            <div className="font-medium text-sm">
              部門 <span className="text-red-500">*</span>
            </div>
            {selectedDepartment && departmentStyles && departmentType ? (
              <div className="flex gap-4">
                <button
                  className={cn(
                    "flex cursor-default items-center space-x-2 rounded-lg border p-3",
                    `${departmentStyles.sectionBorderClass} ${departmentStyles.sectionBgClass}`
                  )}
                  disabled
                  type="button"
                >
                  {getDepartmentIcon(
                    departmentType,
                    cn("h-5 w-5", departmentStyles.iconColor)
                  )}
                  <span
                    className={cn(
                      "font-medium",
                      departmentStyles.sectionTextClass
                    )}
                  >
                    {selectedDepartment.name}
                  </span>
                </button>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">未選択</div>
            )}
            <p className="text-muted-foreground text-xs">
              {slot.isNew
                ? "部門は事前に選択されています"
                : "既存シフトの部門は変更できません"}
            </p>
          </div>

          {/* シフト種別選択（新規作成時のみ変更可能） */}
          {slot.isNew ? (
            <div>
              <Label>
                シフト種別 <span className="text-red-500">*</span>
              </Label>
              <Select
                onValueChange={(value) => onShiftTypeChange(value)}
                value={slot.shiftTypeId || ""}
              >
                <SelectTrigger>
                  <SelectValue placeholder="シフト種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  {shiftTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>シフト種別</Label>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                {selectedShiftType?.name ?? "未選択"}
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                既存シフトの種別は変更できません
              </p>
            </div>
          )}

          {/* 備考 */}
          <div>
            <Label>備考</Label>
            <Textarea
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="追加の情報があれば入力してください"
              value={slot.description}
            />
          </div>

          {/* 選択中のインストラクター */}
          <div>
            <Label>インストラクター</Label>
            <div className="mb-2 text-muted-foreground text-sm">
              下のインストラクター一覧から選択してください
            </div>
            {selectedInstructors.length > 0 ? (
              <ul className="space-y-1">
                {selectedInstructors.map((instructor) => (
                  <li className="text-sm" key={instructor.id}>
                    {instructor.displayName}
                    {instructor.certifications.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
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
            ) : (
              <p className="text-muted-foreground text-sm">
                インストラクターが選択されていません
              </p>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex gap-2">
            <Button
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              キャンセル
            </Button>
            <Button disabled={isSubmitting} onClick={onSave} type="button">
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
