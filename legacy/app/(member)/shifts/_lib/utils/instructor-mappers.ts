import type { ShiftEditInstructor } from "@/app/api/usecases/types/responses";
import type { FormattedInstructor } from "../types";

/**
 * ShiftEditInstructorをFormattedInstructorに変換
 *
 * @description
 * APIレスポンスのShiftEditInstructor型（isAssigned, hasConflictを含む）を、
 * 既存コンポーネントが期待するFormattedInstructor型に変換します。
 * アサイン状態と競合情報は除外されます。
 *
 * @param instructor - 変換元のShiftEditInstructor
 * @returns FormattedInstructor型のインストラクター情報
 *
 * @example
 * ```typescript
 * const shiftInstructor: ShiftEditInstructor = {
 *   id: 1,
 *   displayName: "山田 太郎",
 *   displayNameKana: "ヤマダ タロウ",
 *   status: "ACTIVE",
 *   certificationSummary: "SAJ1級",
 *   isAssigned: true,
 *   hasConflict: false,
 * };
 *
 * const formatted = toFormattedInstructor(shiftInstructor);
 * // { id: 1, displayName: "山田 太郎", displayNameKana: "ヤマダ タロウ", status: "ACTIVE", certificationSummary: "SAJ1級" }
 * ```
 */
export function toFormattedInstructor(
  instructor: ShiftEditInstructor
): FormattedInstructor {
  return {
    id: instructor.id,
    displayName: instructor.displayName,
    displayNameKana: instructor.displayNameKana,
    status: instructor.status,
    certificationSummary: instructor.certificationSummary,
  };
}

/**
 * ShiftEditInstructor配列をFormattedInstructor配列に変換
 *
 * @description
 * 複数のShiftEditInstructorを一括でFormattedInstructorに変換します。
 *
 * @param instructors - 変換元のShiftEditInstructor配列
 * @returns FormattedInstructor配列
 *
 * @example
 * ```typescript
 * const instructors = shiftEditData.availableInstructors;
 * const formatted = toFormattedInstructors(instructors);
 * ```
 */
export function toFormattedInstructors(
  instructors: ShiftEditInstructor[]
): FormattedInstructor[] {
  return instructors.map(toFormattedInstructor);
}
