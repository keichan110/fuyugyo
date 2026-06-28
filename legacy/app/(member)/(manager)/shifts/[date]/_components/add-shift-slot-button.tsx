"use client";

import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type AddShiftSlotButtonProps = {
  onAdd: () => void;
};

/**
 * シフト枠追加ボタン
 *
 * @description
 * 新しいシフト枠を追加するためのボタン。
 */
export function AddShiftSlotButton({ onAdd }: AddShiftSlotButtonProps) {
  return (
    <Button className="w-full" onClick={onAdd} type="button" variant="outline">
      <Plus className="mr-2 h-4 w-4" />
      新しいシフト枠を追加
    </Button>
  );
}
