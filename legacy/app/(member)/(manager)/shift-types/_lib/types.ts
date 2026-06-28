import type { ShiftType as PrismaShiftType } from "@prisma/client";

export type ShiftType = PrismaShiftType;

export type ShiftTypeStats = {
  total: number;
  active: number;
};

export type ShiftTypeFormData = {
  name: string;
  isActive: boolean;
};

export type ShiftTypeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shiftType?: ShiftType | null | undefined;
  onSave: (data: ShiftTypeFormData) => Promise<void>;
};
