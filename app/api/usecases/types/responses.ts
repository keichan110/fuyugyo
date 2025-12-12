import type { ApiErrorResponse } from "@/lib/api/types";
import type { DepartmentMinimal, ShiftTypeMinimal } from "@/lib/types/domain";

/**
 * シフト作成フォームデータのレスポンス型
 *
 * @description
 * `/api/usecases/shifts/form-data` エンドポイントのレスポンス型。
 * API契約型として生産者側（API）に配置し、複数のクライアントから参照可能にする。
 */
export type ShiftFormDataResponse =
  | {
      success: true;
      data: {
        departments: DepartmentMinimal[];
        shiftTypes: ShiftTypeMinimal[];
        stats: {
          activeInstructorsCount: number;
          totalDepartments: number;
          totalShiftTypes: number;
        };
      };
    }
  | ApiErrorResponse;

/**
 * 部門別アクティブインストラクターのレスポンス型
 *
 * @description
 * 資格の有無に関わらず、アクティブなインストラクター全員を返します。
 * `certificationSummary` が "なし" の場合は資格未保有を示します。
 */
export type ActiveInstructorsByDepartmentResponse =
  | {
      success: true;
      data: {
        instructors: Array<{
          id: string;
          displayName: string;
          displayNameKana: string;
          status: string;
          /** 資格情報の要約 ("なし" または "資格名, 資格名, ...") */
          certificationSummary: string;
        }>;
        metadata: {
          departmentId: string;
          departmentName: string;
          totalCount: number;
          activeCount: number;
        };
      };
    }
  | ApiErrorResponse;

/**
 * カレンダービューのレスポンス型
 */
export type CalendarViewResponse =
  | {
      success: true;
      data: {
        shifts: Array<{
          id: string;
          date: string;
          department: {
            id: string;
            name: string;
            code: string;
          };
          shiftType: {
            id: string;
            name: string;
          };
          assignedInstructors: Array<{
            id: string;
            displayName: string;
          }>;
          stats: {
            assignedCount: number;
            hasNotes: boolean;
          };
          description: string | null;
        }>;
        summary: {
          totalShifts: number;
          totalAssignments: number;
          dateRange: {
            from: string;
            to: string;
          };
          byDepartment: Record<string, number>;
        };
      };
    }
  | ApiErrorResponse;

/**
 * シフト編集データのレスポンス型
 */
/**
 * シフト編集用のインストラクター情報
 *
 * @description
 * 通常のFormattedInstructorに加えて、アサイン状態と競合情報を含む
 */
export type ShiftEditInstructor = {
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
  /** このシフトにアサイン済みかどうか */
  isAssigned: boolean;
  /** 同日の他シフトと競合しているかどうか */
  hasConflict: boolean;
};

/**
 * シフト編集データのレスポンス型
 *
 * @description
 * `/api/usecases/shifts/edit-data` エンドポイントのレスポンス型。
 * シフト編集モーダルで必要な全データ（既存シフト、インストラクター一覧、競合情報）を一度に返す。
 */
export type ShiftEditDataResponse =
  | {
      success: true;
      data: {
        /** 編集モード（既存シフト編集）か作成モード（新規シフト作成）か */
        mode: "edit" | "create";
        /** 既存シフト情報（作成モードの場合はnull） */
        shift: {
          id: string;
          date: string;
          departmentId: string;
          shiftTypeId: string;
          description: string | null;
          assignedInstructorIds: string[];
        } | null;
        /** 利用可能なインストラクター一覧（アサイン状態と競合情報付き） */
        availableInstructors: ShiftEditInstructor[];
        /** 競合情報の詳細リスト */
        conflicts: Array<{
          instructorId: string;
          instructorName: string;
          conflictingShift: {
            id: string;
            departmentName: string;
            shiftTypeName: string;
          };
        }>;
        /** フォーム初期値 */
        formData: {
          date: string;
          departmentId: string;
          shiftTypeId: string;
          description: string | null;
          selectedInstructorIds: string[];
        };
      };
    }
  | ApiErrorResponse;
