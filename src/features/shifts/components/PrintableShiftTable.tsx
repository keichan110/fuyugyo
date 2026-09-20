import { useEffect, useRef, useState } from 'react';

import type { PrintableShiftTable as PrintableShiftTableData } from '../printable-table';
import classes from './PrintableShiftTable.module.css';

type PrintableShiftTableProps = {
  /** 印刷する月間シフト表（対象月・部門欄・日付行） */
  table: PrintableShiftTableData;
};

/**
 * 月間シフト表の紙面を描画し、表示と同時に印刷ダイアログを自動的に開く。
 * 紙面には操作ボタンとアプリのナビゲーションを載せない。再印刷はブラウザの印刷操作を直接使う想定。
 * @param table - 印刷する月間シフト表
 */
export function PrintableShiftTable({ table }: PrintableShiftTableProps) {
  // 紙面に載せる出力日時は、この紙面を組み立てた時刻に固定する（再描画で動かさない）
  const [printedAt] = useState(() => new Date());
  const hasAutoPrintedRef = useRef(false);

  // 印刷用ページの表示中だけ、印刷時にアプリの外枠を隠すスタイルを有効にする
  useEffect(() => {
    document.body.dataset['printLayout'] = 'shift-table';
    return () => {
      delete document.body.dataset['printLayout'];
    };
  }, []);

  // 紙面が組み上がった時点で自動的に印刷を開始する（モーダルからここまで手動操作を挟まないため）。
  // StrictMode のマウント→アンマウント→再マウントで二重発火しないよう ref で一度きりに抑える。
  useEffect(() => {
    if (hasAutoPrintedRef.current) {
      return;
    }
    hasAutoPrintedRef.current = true;
    window.print();
  }, []);

  const [year, month] = table.month.split('-');
  const monthLabel = `${Number(year)}年${Number(month)}月`;

  return (
    <div data-print-root className={classes.sheet}>
      <h1 className={classes.title}>{monthLabel} シフト表</h1>
      <p className={classes.meta}>
        出力日時 {formatPrintedAt(printedAt)}（シフトの最終更新日時ではありません）
      </p>

      <table className={classes.table}>
        <thead>
          <tr>
            <th scope="col" className={classes.dateColumn}>
              日付
              {/* 2ページ目以降でも対象月が分かるよう、繰り返される列見出しに年月を併記する */}
              <span className={classes.headerMonth}>{monthLabel}</span>
            </th>
            {table.departments.map((department) => (
              <th key={department.code} scope="col">
                {department.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.date} className={classes.row}>
              <th scope="row" className={classes.dateColumn}>
                {row.dateLabel}
              </th>
              {row.cells.map((cell) => (
                <td key={cell.departmentCode} className={classes.cell}>
                  {cell.groups.map((group) => (
                    <p key={group.id} className={classes.groupLine}>
                      {group.shiftTypeName}：{group.instructorNames.join('・')}
                    </p>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 出力日時を「YYYY/MM/DD HH:mm」（ローカル時刻）で整形する。 */
function formatPrintedAt(printedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${printedAt.getFullYear()}/${pad(printedAt.getMonth() + 1)}/${pad(printedAt.getDate())}` +
    ` ${pad(printedAt.getHours())}:${pad(printedAt.getMinutes())}`
  );
}
