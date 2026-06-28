import { format, parse } from "date-fns";
import { ja } from "date-fns/locale";
import { isHoliday } from "@/app/(member)/shifts/_lib/constants";
import type { ShiftSlot, ShiftWithRelations } from "./types";

/**
 * 日付文字列を日本語形式にフォーマット
 *
 * @param dateString - YYYY-MM-DD 形式の日付文字列
 * @returns "YYYY年MM月DD日（曜日）" 形式の文字列
 *
 * @example
 * formatDateJa("2024-12-15") // "2024年12月15日（日）"
 */
export function formatDateJa(dateString: string): string {
  const date = parse(dateString, "yyyy-MM-dd", new Date());
  return format(date, "yyyy年MM月dd日（E）", { locale: ja });
}

/**
 * 日付が祝日かどうかを判定
 *
 * @param dateString - YYYY-MM-DD 形式の日付文字列
 * @returns 祝日の場合は true
 */
export function isDateHoliday(dateString: string): boolean {
  return isHoliday(dateString);
}

/**
 * データベースから取得したシフトをUIの状態に変換
 *
 * @param shifts - データベースから取得したシフト一覧
 * @returns UIで使用するシフト枠の配列
 */
export function transformShiftsToSlots(
  shifts: ShiftWithRelations[]
): ShiftSlot[] {
  return shifts.map((shift) => ({
    id: shift.id,
    departmentId: shift.departmentId,
    shiftTypeId: shift.shiftTypeId,
    description: shift.description ?? "",
    instructorIds: shift.shiftAssignments.map((a) => a.instructorId),
    isEditing: false,
    isNew: false,
  }));
}

/**
 * シフト枠のバリデーション
 *
 * @param slot - 検証対象のシフト枠
 * @returns エラーメッセージの配列（空の場合は検証成功）
 */
export function validateShiftSlot(slot: ShiftSlot): string[] {
  const errors: string[] = [];

  if (!slot.departmentId) {
    errors.push("部門を選択してください");
  }

  if (!slot.shiftTypeId) {
    errors.push("シフト種別を選択してください");
  }

  if (slot.instructorIds.length === 0) {
    errors.push("最低1名のインストラクターを選択してください");
  }

  return errors;
}

/**
 * 配置情報を文字列に整形
 *
 * @param assignmentInfo - 配置情報の配列
 * @returns 配置情報の文字列（例: "午前レッスン"）
 */
export function formatAssignmentInfo(
  assignmentInfo: Array<{ departmentName: string; shiftTypeName: string }>
): string {
  if (assignmentInfo.length === 0) {
    return "利用可能";
  }

  // biome-ignore lint/style/noNonNullAssertion: 配列の長さを確認済み
  const firstAssignment = assignmentInfo[0]!;

  if (assignmentInfo.length === 1) {
    return firstAssignment.shiftTypeName;
  }

  return `${firstAssignment.shiftTypeName} 他${assignmentInfo.length - 1}件`;
}
