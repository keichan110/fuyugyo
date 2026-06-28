import { useCallback } from "react";
import { getDepartmentCodeById } from "./shift-utils";
import type {
  AssignedInstructor,
  Department,
  Shift,
  ShiftStats,
  ShiftSummary,
} from "./types";

/**
 * シフトデータ変換のカスタムフック
 */
export function useShiftDataTransformation() {
  // シフトデータを統計データに変換
  const transformShiftsToStats = useCallback(
    (shifts: Shift[], departments: Department[]): ShiftStats => {
      // アサイン済みインストラクター情報を抽出
      const extractAssignedInstructors = (shift: Shift): AssignedInstructor[] =>
        shift.assignments.map((assignment) => ({
          id: assignment.instructor.id,
          lastName: assignment.instructor.lastName,
          firstName: assignment.instructor.firstName,
          displayName: `${assignment.instructor.lastName} ${assignment.instructor.firstName}`,
        }));

      // 既存シフトに新しいシフト情報をマージ
      const mergeShiftData = (
        existingShift: ShiftSummary,
        shift: Shift,
        assignedInstructors: AssignedInstructor[]
      ): void => {
        existingShift.count += shift.assignedCount;
        if (existingShift.assignedInstructors) {
          existingShift.assignedInstructors.push(...assignedInstructors);
        } else {
          existingShift.assignedInstructors = assignedInstructors;
        }
        if (shift.isMyShift) {
          existingShift.isMyShift = true;
        }
      };

      const stats: ShiftStats = {};

      for (const shift of shifts) {
        const date = shift.date;
        if (!stats[date]) {
          stats[date] = { shifts: [] };
        }

        const departmentCode = getDepartmentCodeById(
          shift.departmentId,
          departments
        );

        const assignedInstructors = extractAssignedInstructors(shift);

        // 同じ部門・シフト種別の組み合わせが既に存在するかチェック
        const existingShift = stats[date].shifts.find(
          (s) =>
            s.type === shift.shiftType.name && s.department === departmentCode
        );

        if (existingShift) {
          mergeShiftData(existingShift, shift, assignedInstructors);
        } else {
          // 新しいシフトエントリを追加
          stats[date].shifts.push({
            type: shift.shiftType.name,
            department: departmentCode as "ski" | "snowboard",
            count: shift.assignedCount,
            assignedInstructors,
            isMyShift: shift.isMyShift,
          });
        }
      }

      return stats;
    },
    []
  );

  return {
    transformShiftsToStats,
  };
}
