import { describe, expect, it } from 'vitest';

import { DEPARTMENT_LABELS } from '../src/features/departments/schema';
import type { DepartmentCode } from '../src/features/departments/schema';
import { buildPrintableShiftTable } from '../src/features/shifts/printable-table';
import type { ShiftViewItem } from '../src/features/shifts/schema';

/**
 * 印刷用シフト表の行生成（月次データ + 印刷条件 → 印刷行）の単体テスト。
 * 月全体の日付・部門・種別・担当者の組み立てを、DB 非依存の純粋関数として検証する。
 */

describe('buildPrintableShiftTable', () => {
  it('割り当てが無い月でも月初から月末までの全日付を昇順で並べる', () => {
    const table = buildPrintableShiftTable({
      month: '2026-02',
      selection: 'both',
      shifts: [],
    });

    expect(table.rows).toHaveLength(28);
    expect(table.rows[0]?.date).toBe('2026-02-01');
    expect(table.rows.at(-1)?.date).toBe('2026-02-28');
    expect(table.rows.every((row) => row.cells.every((cell) => cell.groups.length === 0))).toBe(
      true,
    );
  });
});

/** テスト用の月次シフト1件を生成するヘルパー */
function makeShift(params: {
  id: string;
  date: string;
  departmentCode: DepartmentCode;
  shiftTypeName: string;
  instructorNames: string[];
}): ShiftViewItem {
  return {
    id: params.id,
    date: params.date,
    description: 'この説明文は紙面に載せない',
    department: {
      name: DEPARTMENT_LABELS[params.departmentCode],
      code: params.departmentCode,
    },
    shiftType: { id: `type-${params.shiftTypeName}`, name: params.shiftTypeName },
    assignedInstructors: params.instructorNames.map((displayName, index) => ({
      id: `inst-${params.id}-${index}`,
      displayName,
    })),
  };
}

describe('buildPrintableShiftTable の割り当て', () => {
  it('部門欄ごとに種別名と担当者を入力順で並べる', () => {
    const table = buildPrintableShiftTable({
      month: '2026-01',
      selection: 'both',
      shifts: [
        makeShift({
          id: 's1',
          date: '2026-01-10',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: ['田中 太郎', '佐藤 花子'],
        }),
        makeShift({
          id: 's2',
          date: '2026-01-10',
          departmentCode: 'ski',
          shiftTypeName: 'バッジテスト',
          instructorNames: ['鈴木 一郎'],
        }),
        makeShift({
          id: 's3',
          date: '2026-01-10',
          departmentCode: 'snowboard',
          shiftTypeName: '団体レッスン',
          instructorNames: ['高橋 次郎'],
        }),
      ],
    });

    const row = table.rows.find((r) => r.date === '2026-01-10');
    expect(row?.cells[0]?.groups).toEqual([
      { id: 's1', shiftTypeName: '一般レッスン', instructorNames: ['田中 太郎', '佐藤 花子'] },
      { id: 's2', shiftTypeName: 'バッジテスト', instructorNames: ['鈴木 一郎'] },
    ]);
    expect(row?.cells[1]?.groups).toEqual([
      { id: 's3', shiftTypeName: '団体レッスン', instructorNames: ['高橋 次郎'] },
    ]);
  });

  it('担当者がいない勤務枠は種別名ごと載せない', () => {
    const table = buildPrintableShiftTable({
      month: '2026-01',
      selection: 'both',
      shifts: [
        makeShift({
          id: 's1',
          date: '2026-01-10',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: [],
        }),
      ],
    });

    expect(table.rows.find((r) => r.date === '2026-01-10')?.cells[0]?.groups).toEqual([]);
  });

  it('単一部門を指定すると対象部門の欄だけを載せる', () => {
    const table = buildPrintableShiftTable({
      month: '2026-01',
      selection: 'snowboard',
      shifts: [
        makeShift({
          id: 's1',
          date: '2026-01-10',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: ['田中 太郎'],
        }),
        makeShift({
          id: 's2',
          date: '2026-01-10',
          departmentCode: 'snowboard',
          shiftTypeName: '一般レッスン',
          instructorNames: ['高橋 次郎'],
        }),
      ],
    });

    const row = table.rows.find((r) => r.date === '2026-01-10');
    expect(row?.cells.map((cell) => cell.departmentCode)).toEqual(['snowboard']);
    expect(row?.cells[0]?.groups.map((group) => group.instructorNames)).toEqual([['高橋 次郎']]);
  });

  it('対象月外のシフトを載せず、月末だけの割り当ても落とさない', () => {
    const table = buildPrintableShiftTable({
      month: '2025-12',
      selection: 'both',
      shifts: [
        makeShift({
          id: 's1',
          date: '2025-11-30',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: ['前月 太郎'],
        }),
        makeShift({
          id: 's2',
          date: '2025-12-31',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: ['大晦日 花子'],
        }),
        makeShift({
          id: 's3',
          date: '2026-01-01',
          departmentCode: 'ski',
          shiftTypeName: '一般レッスン',
          instructorNames: ['翌月 次郎'],
        }),
      ],
    });

    expect(table.rows).toHaveLength(31);
    expect(table.rows.at(-1)?.date).toBe('2025-12-31');
    expect(table.rows.at(-1)?.cells[0]?.groups.map((group) => group.instructorNames)).toEqual([
      ['大晦日 花子'],
    ]);
    expect(
      table.rows.filter((row) => row.cells.some((cell) => cell.groups.length > 0)),
    ).toHaveLength(1);
  });
});

describe('buildPrintableShiftTable の日付表記', () => {
  it('日付を「5（土）」「12（月・祝）」のように曜日・祝日付きで表す', () => {
    const rows = buildPrintableShiftTable({
      month: '2026-01',
      selection: 'both',
      shifts: [],
    }).rows;

    expect(rows.find((row) => row.date === '2026-01-01')?.dateLabel).toBe('1（木・祝）');
    expect(rows.find((row) => row.date === '2026-01-03')?.dateLabel).toBe('3（土）');
    expect(rows.find((row) => row.date === '2026-01-12')?.dateLabel).toBe('12（月・祝）');
  });

  it('月の日数（28／29／30／31）に合わせて行数を変える', () => {
    const rowCount = (month: string) =>
      buildPrintableShiftTable({ month, selection: 'both', shifts: [] }).rows.length;

    expect(rowCount('2026-02')).toBe(28);
    expect(rowCount('2028-02')).toBe(29);
    expect(rowCount('2026-04')).toBe(30);
    expect(rowCount('2026-01')).toBe(31);
  });
});
