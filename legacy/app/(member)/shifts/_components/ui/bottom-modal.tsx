"use client";

import { PublicShiftModal } from "@/app/(member)/shifts/_components/base/modal";
import { renderDepartmentSections } from "../../_lib/shift-components";
import type { DayData } from "../../_lib/types";

type PublicShiftBottomModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string | null;
  dayData: DayData | null;
};

export function PublicShiftBottomModal({
  isOpen,
  onOpenChange,
  selectedDate,
  dayData,
}: PublicShiftBottomModalProps) {
  return (
    <PublicShiftModal
      dayData={dayData}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      selectedDate={selectedDate}
    >
      {/* 部門別セクション表示（統合版・表示専用） */}
      {dayData && renderDepartmentSections(dayData.shifts)}
    </PublicShiftModal>
  );
}
