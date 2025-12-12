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
  /** 現在のユーザーがこのシフトにアサインされているか */
  isMyShift?: boolean | undefined;
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

// アサイン済みインストラクター情報（公開ビュー用）
export type AssignedInstructor = {
  id: string;
  lastName: string;
  firstName: string;
  displayName: string; // "lastName firstName" 形式
};

// Base API response type
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  count?: number;
  message: string | null;
  error: string | null;
};

// Department types
// DepartmentType is now simplified to use department.code directly
export type DepartmentType = "ski" | "snowboard";

// Shift summary and statistics
export type ShiftSummary = {
  type: string;
  department: DepartmentType;
  count: number;
  assignedInstructors?: AssignedInstructor[]; // アサイン済みインストラクター情報
  /** 現在のユーザーがこのシフトにアサインされているか */
  isMyShift?: boolean | undefined;
};

export type DetailedShiftSummary = {
  type: string;
  department: DepartmentType;
  count: number;
  instructors: string[]; // インストラクター名の配列
};

export type ShiftStats = {
  [date: string]: {
    shifts: ShiftSummary[];
  };
};

export type DetailedShiftStats = {
  [date: string]: {
    shifts: DetailedShiftSummary[];
  };
};

// Readonly entity interfaces for better immutability
export interface ReadonlyShift
  extends Omit<Shift, "department" | "shiftType" | "assignments"> {
  readonly department: Department;
  readonly shiftType: ShiftType;
  readonly assignments: readonly ShiftAssignment[];
}

// Query parameter types for better type safety
export type ShiftQueryParams = {
  readonly departmentId?: string;
  readonly shiftTypeId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
};

export type CreateShiftData = {
  readonly date: string;
  readonly departmentId: string;
  readonly shiftTypeId: string;
  readonly description?: string | null;
  readonly assignedInstructorIds?: readonly string[];
};

export type DayData = {
  readonly date: string;
  readonly shifts: readonly ShiftSummary[];
  readonly isHoliday: boolean;
};

export type DetailedDayData = {
  readonly date: string;
  readonly shifts: readonly DetailedShiftSummary[];
  readonly isHoliday: boolean;
};

// Form data interfaces
export type ShiftFormData = {
  readonly selectedDate: string;
  readonly dateFormatted: string;
};

// Calendar related types
export type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly date: string;
  readonly weekday: number;
  readonly isHoliday: boolean;
  readonly isToday: boolean;
};

/**
 * サーバー側でフォーマット済みのインストラクター情報
 *
 * @description
 * `/api/usecases/instructors/active-by-department` APIから返される
 * インストラクター情報の型定義。
 * サーバー側で姓名結合・資格情報の要約が完了しているため、
 * フロントエンドでの追加処理は不要です。
 */
export type FormattedInstructor = {
  /** インストラクターID */
  id: string;
  /** 表示名（姓名が結合済み、例: "山田 太郎"） */
  displayName: string;
  /** カナ表示名（姓名カナが結合済み、例: "ヤマダ タロウ"） */
  displayNameKana: string;
  /** ステータス（"ACTIVE" など） */
  status: string;
  /** 資格情報の要約文字列（例: "SAJ1級, SAJ2級" または "なし"） */
  certificationSummary: string;
};

// ドメイン共通型を再エクスポート
// API契約型とUIコンポーネントの両方で使用する型はlib/types/domainから参照
export type { DepartmentMinimal, ShiftTypeMinimal } from "@/lib/types/domain";
