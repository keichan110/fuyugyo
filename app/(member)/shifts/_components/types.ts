/**
 * @file シフトコンポーネント共通型定義
 * @description
 * app/(member)/shifts/_components 配下のコンポーネントで使用される共通型定義。
 * シフト、部門、インストラクター、統計情報などの型を定義しています。
 */

/**
 * シフトエンティティ
 */
export type Shift = {
  id: string;
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  department: Department;
  shiftType: ShiftType;
  assignments: ShiftAssignment[];
  assignedCount: number;
};

export type Department = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ShiftType = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShiftAssignment = {
  id: string;
  shiftId: string;
  instructorId: string;
  assignedAt: string;
  instructor: Instructor;
};

export type Instructor = {
  id: string;
  lastName: string;
  firstName: string;
  status: string;
};

// Department types
// DepartmentType is now simplified to use department.code directly
export type DepartmentType = "ski" | "snowboard";

// Shift summary and statistics
export type ShiftSummary = {
  type: string;
  department: DepartmentType;
  count: number;
  /** 現在のユーザーがこのシフトにアサインされているか */
  isMyShift?: boolean | undefined;
};

export type ShiftStats = {
  [date: string]: {
    shifts: ShiftSummary[];
  };
};

// Base props for shared components
export type BaseShiftDisplayProps = {
  year: number;
  month: number;
  shiftStats: ShiftStats;
  isHoliday: (date: string) => boolean;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
};

/**
 * シフトカレンダーグリッドコンポーネントのProps型
 * BaseShiftDisplayPropsを継承
 */
export type ShiftCalendarGridProps = BaseShiftDisplayProps;

/**
 * シフトモバイルリストコンポーネントのProps型
 * BaseShiftDisplayPropsを継承
 */
export type ShiftMobileListProps = BaseShiftDisplayProps;
