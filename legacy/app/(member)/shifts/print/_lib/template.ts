import { isHoliday, WEEKDAYS } from "@/app/(member)/shifts/_lib/constants";
import type { MonthlyViewData } from "@/app/(member)/shifts/_lib/data";
import { getInlineStyles } from "./styles";

/**
 * 曜日定数
 */
const SUNDAY = 0;
const SATURDAY = 6;

/**
 * 日付ごと、部門ごとにシフトをグループ化した型
 */
type ShiftsByDateAndDept = Map<
  string,
  Map<
    string,
    Array<{
      shiftType: string;
      instructors: string[];
    }>
  >
>;

/**
 * 日付ごと、部門ごとにシフトをグループ化
 *
 * @remarks
 * - 月の全ての日付（1日〜月末）を生成
 * - 全ての日付と部門の組み合わせを初期化（シフトがなくても行・列を表示するため）
 * - 実際のシフトデータを各セルに格納
 *
 * @param shifts - シフトデータ
 * @param departments - 部門一覧
 * @param year - 年
 * @param month - 月
 * @returns 日付×部門のマトリクス
 */
function groupShiftsByDateAndDepartment(
  shifts: MonthlyViewData["shifts"],
  departments: Array<{ id: string; name: string; code: string }>,
  year: number,
  month: number
): ShiftsByDateAndDept {
  const grouped: ShiftsByDateAndDept = new Map();

  // 月の全ての日付を生成（1日〜月末）
  // monthは1-12の値なので、month番目の月の0日 = month月の最終日
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDates: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    // UTCを使用してタイムゾーンの影響を避ける
    const date = new Date(Date.UTC(year, month - 1, day));
    // ISO形式の日付文字列（YYYY-MM-DD）
    allDates.push(date.toISOString().slice(0, 10));
  }

  // 全ての日付と部門の組み合わせを初期化
  for (const date of allDates) {
    const deptMap = new Map<
      string,
      Array<{
        shiftType: string;
        instructors: string[];
      }>
    >();

    for (const dept of departments) {
      deptMap.set(dept.name, []);
    }

    grouped.set(date, deptMap);
  }

  // 実際のシフトデータを格納
  for (const shift of shifts) {
    const deptMap = grouped.get(shift.date);
    if (!deptMap) {
      continue;
    }

    const deptShifts = deptMap.get(shift.department.name);
    if (!deptShifts) {
      continue;
    }

    deptShifts.push({
      shiftType: shift.shiftType.name,
      instructors: shift.assignedInstructors.map((i) => i.displayName),
    });
  }

  return grouped;
}

/**
 * 日付を "M/D(曜)" 形式にフォーマット
 *
 * @param dateStr - ISO形式の日付文字列
 * @returns フォーマットされた日付文字列（例: "1/1(水)"）
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = WEEKDAYS[date.getUTCDay()];

  return `${month}/${day}(${weekday})`;
}

/**
 * HTMLエスケープ処理
 *
 * @param str - エスケープする文字列
 * @returns エスケープされた文字列
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * PDF用のHTMLテンプレートを生成
 *
 * @remarks
 * カレンダー形式のテーブルレイアウト:
 * - 左端列: 日付（M/D(曜)形式）+ 祝日フラグ
 * - 各部門列: シフト種別ごとにグループ化して表示
 * - シフトがない部門は空のセルとして表示（一覧性重視）
 *
 * @param data - 月次シフトデータ
 * @param departments - 部門一覧
 * @param year - 年
 * @param month - 月
 * @returns HTML文字列
 */
export function generatePDFTemplate(
  data: MonthlyViewData,
  departments: Array<{ id: string; name: string; code: string }>,
  year: number,
  month: number
): string {
  const { shifts } = data;

  // 日付・部門ごとにグループ化（月の全日付を含む）
  const shiftsByDateAndDept = groupShiftsByDateAndDepartment(
    shifts,
    departments,
    year,
    month
  );

  // 現在の日時を取得
  const now = new Date();
  const generatedAt = now.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // 部門列の幅を計算（日付列60px固定、残りを均等分配）
  const deptColumnWidth =
    departments.length > 0
      ? `calc((100% - 60px) / ${departments.length})`
      : "auto";

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${year}年${month}月 シフト表</title>
      <style>
        ${getInlineStyles()}
        /* テーブルレイアウトを固定にして列幅を確実に適用 */
        .shift-table {
          table-layout: fixed;
        }
        /* 部門列の幅を均等に固定 */
        .shift-table thead th.dept-col,
        .shift-table tbody td.dept-cell {
          width: ${deptColumnWidth};
        }
      </style>
    </head>
    <body>
      <header>
        <h1>${year}年${month}月 シフト表</h1>
        <div class="generated-at">生成日時: ${generatedAt}</div>
      </header>

      <main>
        <table class="shift-table">
          <thead>
            <tr>
              <th class="date-col">日付</th>
              ${departments
                .map(
                  (dept) => `
                <th class="dept-col">${escapeHtml(dept.name)}</th>
              `
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${Array.from(shiftsByDateAndDept.entries())
              .map(([date, deptMap]) => {
                const isHolidayDate = isHoliday(date);
                const dateObj = new Date(date);
                const dayOfWeek = dateObj.getUTCDay();
                const dayOfMonth = dateObj.getUTCDate();

                // 日付セルのクラスを決定
                const dateCellClasses = ["date-cell"];
                if (isHolidayDate) {
                  dateCellClasses.push("holiday");
                } else if (dayOfWeek === SUNDAY) {
                  dateCellClasses.push("sunday");
                } else if (dayOfWeek === SATURDAY) {
                  dateCellClasses.push("saturday");
                }

                // 行のクラスを決定（偶数日）
                const rowClasses: string[] = [];
                if (dayOfMonth % 2 === 0) {
                  rowClasses.push("even-day");
                }

                return `
                <tr class="${rowClasses.join(" ")}">
                  <td class="${dateCellClasses.join(" ")}">
                    <div class="date-main">${formatDate(date)}</div>
                    ${isHolidayDate ? '<div class="holiday-label">祝日</div>' : ""}
                  </td>
                  ${departments
                    .map((dept) => {
                      const deptShifts = deptMap.get(dept.name) || [];

                      if (deptShifts.length === 0) {
                        return '<td class="dept-cell empty"></td>';
                      }

                      return `
                      <td class="dept-cell">
                        ${deptShifts
                          .map(
                            (shift) => `
                          <div class="shift-group">
                            <div class="shift-type">■${escapeHtml(shift.shiftType)}</div>
                            ${shift.instructors.length > 0 ? `<div class="instructor">${shift.instructors.map((instructor) => escapeHtml(instructor)).join("、")}</div>` : ""}
                          </div>
                        `
                          )
                          .join("")}
                      </td>
                    `;
                    })
                    .join("")}
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </main>

      <footer>
        <p>Fuyugyō - 運営管理システム</p>
      </footer>
    </body>
    </html>
  `;
}
