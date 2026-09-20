import { z } from 'zod';

import { DEPARTMENT_LABELS, departmentCodeSchema } from '@/features/departments/schema';
import type { DepartmentCode } from '@/features/departments/schema';

import type { ShiftViewItem } from './schema';
import { addDays, addMonths, isJapaneseHoliday, parseDate, WEEKDAY_LABELS } from './view-utils';

/**
 * 印刷用シフト表の行生成（月次データ + 印刷条件 → 印刷行）。
 * DB・React に依存しない純粋関数として、紙面に載せる日付・部門・種別・担当者を組み立てる。
 */

/** 印刷対象の部門指定（両部門 or 単一部門） */
export const printableDepartmentSelectionSchema = z.enum(['both', ...departmentCodeSchema.options]);

export type PrintableDepartmentSelection = z.infer<typeof printableDepartmentSelectionSchema>;

/** 部門欄に載せる勤務枠1件（種別名と担当者名） */
export type PrintableShiftGroup = {
  /** 元の Shift ID（描画時のキーに使う） */
  id: string;
  shiftTypeName: string;
  instructorNames: string[];
};

/** 部門欄1つ分（その日・その部門の勤務枠） */
export type PrintableDepartmentCell = {
  departmentCode: DepartmentCode;
  /** 担当者がいる勤務枠のみ。空配列は手書き用の完全な空欄を意味する */
  groups: PrintableShiftGroup[];
};

/** 印刷行1つ分（1日付） */
export type PrintableShiftRow = {
  /** 勤務日（YYYY-MM-DD） */
  date: string;
  /** 紙面の日付表記（「5（土）」「12（月・祝）」のように白黒でも曜日・祝日が分かる） */
  dateLabel: string;
  cells: PrintableDepartmentCell[];
};

/** 紙面に載せる月間シフト表 */
export type PrintableShiftTable = {
  /** 対象月（YYYY-MM） */
  month: string;
  /** 部門欄の並び（列見出しに使う） */
  departments: { code: DepartmentCode; label: string }[];
  rows: PrintableShiftRow[];
};

/** 印刷対象の部門コードを、部門指定から解決する。 */
export function printableDepartmentCodes(
  selection: PrintableDepartmentSelection,
): DepartmentCode[] {
  return selection === 'both' ? [...departmentCodeSchema.options] : [selection];
}

/** 対象月（YYYY-MM）の月初から月末までの日付を昇順で列挙する。 */
export function monthDates(month: string): string[] {
  const dates: string[] = [];
  const end = addDays(`${addMonths(month, 1)}-01`, -1);
  for (let date = `${month}-01`; date <= end; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * 紙面用の日付表記を組み立てる（例: 「5（土）」「12（月・祝）」）。
 * 白黒印刷でも曜日と祝日を文字だけで識別できるようにする。
 * @param date - 勤務日（YYYY-MM-DD）
 */
export function printableDateLabel(date: string): string {
  const parsed = parseDate(date);
  const weekday = WEEKDAY_LABELS[parsed.getUTCDay()];
  const holidaySuffix = isJapaneseHoliday(date) ? '・祝' : '';
  return `${parsed.getUTCDate()}（${weekday}${holidaySuffix}）`;
}

/**
 * 月次データと印刷条件から印刷行を組み立てる。
 * 対象月の全日付を昇順に並べ、日付 × 部門ごとに担当者のいる勤務枠だけを入力順で載せる。
 * @param params - 対象月（YYYY-MM）・部門指定・月次カレンダーのシフト配列
 */
export function buildPrintableShiftTable(params: {
  month: string;
  selection: PrintableDepartmentSelection;
  shifts: ShiftViewItem[];
}): PrintableShiftTable {
  const departmentCodes = printableDepartmentCodes(params.selection);
  const dates = monthDates(params.month);

  // 「日付:部門」をキーに、担当者のいる勤務枠だけを月次データの並び順のまま溜める。
  // 種別の並びは API（部門別の表示順 → 種別名）に従い、印刷側では並べ替えない。
  const groupsByDateDepartment = new Map<string, PrintableShiftGroup[]>();
  for (const shift of params.shifts) {
    if (shift.assignedInstructors.length === 0) {
      continue;
    }
    const key = `${shift.date}:${shift.department.code}`;
    const groups = groupsByDateDepartment.get(key) ?? [];
    groups.push({
      id: shift.id,
      shiftTypeName: shift.shiftType.name,
      instructorNames: shift.assignedInstructors.map((instructor) => instructor.displayName),
    });
    groupsByDateDepartment.set(key, groups);
  }

  return {
    month: params.month,
    departments: departmentCodes.map((code) => ({ code, label: DEPARTMENT_LABELS[code] })),
    rows: dates.map((date) => ({
      date,
      dateLabel: printableDateLabel(date),
      cells: departmentCodes.map((departmentCode) => ({
        departmentCode,
        groups: groupsByDateDepartment.get(`${date}:${departmentCode}`) ?? [],
      })),
    })),
  };
}
