/**
 * 共通型定義
 * アプリケーション全体で使用される基本的な型定義
 */

/**
 * Branded Types - 型安全性を向上させるための型エイリアス
 */
export type DepartmentId = number & { readonly __brand: "DepartmentId" };
export type CertificationId = number & { readonly __brand: "CertificationId" };
export type InstructorId = number & { readonly __brand: "InstructorId" };
export type ShiftId = number & { readonly __brand: "ShiftId" };
export type ShiftTypeId = number & { readonly __brand: "ShiftTypeId" };
export type ShiftAssignmentId = number & {
  readonly __brand: "ShiftAssignmentId";
};

/**
 * Branded Type を作成するヘルパー関数
 */
export const createDepartmentId = (id: number): DepartmentId =>
  id as DepartmentId;
export const createCertificationId = (id: number): CertificationId =>
  id as CertificationId;
export const createInstructorId = (id: number): InstructorId =>
  id as InstructorId;
export const createShiftId = (id: number): ShiftId => id as ShiftId;
export const createShiftTypeId = (id: number): ShiftTypeId => id as ShiftTypeId;
export const createShiftAssignmentId = (id: number): ShiftAssignmentId =>
  id as ShiftAssignmentId;

/**
 * 基本エンティティ型
 */
export type BaseEntity = {
  readonly id: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * ページネーション情報
 */
export type PaginationInfo = {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
};

/**
 * ソート情報
 */
export type SortInfo = {
  readonly field: string;
  readonly direction: "asc" | "desc";
};

/**
 * フィルター基底型
 */
export type BaseFilter = {
  readonly isActive?: boolean;
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;
};

/**
 * 検索パラメータ
 */
export type SearchParams = {
  readonly query?: string;
  readonly filters?: Record<string, unknown>;
  readonly sort?: SortInfo;
  readonly pagination?: Pick<PaginationInfo, "page" | "perPage">;
};

/**
 * バリデーションエラー詳細
 */
export type ValidationError = {
  readonly field: string;
  readonly message: string;
  readonly code?: string;
};

/**
 * インストラクターステータス
 */
export const INSTRUCTOR_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  RETIRED: "RETIRED",
} as const;

export type InstructorStatus =
  (typeof INSTRUCTOR_STATUS)[keyof typeof INSTRUCTOR_STATUS];

/**
 * レスポンス状態
 */
export type LoadingState = {
  readonly isLoading: boolean;
  readonly error: Error | null;
};

/**
 * フォーム状態
 */
export type FormState<T> = LoadingState & {
  readonly data: T;
  readonly isDirty: boolean;
  readonly isValid: boolean;
  readonly errors: Record<string, string>;
};

/**
 * 選択状態
 */
export type SelectionState<T> = {
  readonly selectedItems: readonly T[];
  readonly isAllSelected: boolean;
};

/**
 * 日付範囲
 */
export type DateRange = {
  readonly start: Date;
  readonly end: Date;
};

/**
 * カラー定義（テーマ対応）
 */
export const DEPARTMENT_COLORS = {
  ski: "blue",
  snowboard: "green",
  telemark: "purple",
  cross_country: "orange",
} as const;

export type DepartmentColor =
  (typeof DEPARTMENT_COLORS)[keyof typeof DEPARTMENT_COLORS];

/**
 * アイコン名定義
 */
export const DEPARTMENT_ICONS = {
  ski: "ski",
  snowboard: "snowboard",
  telemark: "telemark",
  cross_country: "cross-country",
} as const;

export type DepartmentIcon =
  (typeof DEPARTMENT_ICONS)[keyof typeof DEPARTMENT_ICONS];
