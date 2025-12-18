/**
 * PDF印刷用のインラインCSSスタイル定義
 *
 * @description
 * A4縦向きレイアウトに最適化された印刷用スタイル。
 * モノクロ/グレースケール基調で印刷コストを考慮。
 */
export function getInlineStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 8mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Noto Sans JP', 'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif;
      font-size: 6pt;
      color: #000;
      line-height: 1.2;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #333;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    h1 {
      font-size: 10pt;
      font-weight: bold;
      margin: 0;
    }

    .generated-at {
      font-size: 5pt;
      color: #666;
    }

    /* メインテーブル */
    .shift-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 5pt;
      margin-bottom: 8px;
    }

    /* ヘッダー行 */
    .shift-table thead th {
      background-color: #d0d0d0;
      padding: 3px 2px;
      text-align: left;
      border: 1px solid #999;
      font-weight: bold;
      font-size: 6pt;
    }

    .shift-table thead th.date-col {
      width: 60px;
    }

    .shift-table thead th.dept-col {
      /* 残りの幅を均等に分配 */
    }

    /* データ行 */
    .shift-table tbody tr {
      page-break-inside: avoid;
    }

    /* 偶数日の背景色 */
    .shift-table tbody tr.even-day {
      background-color: #f5f5f5;
    }

    /* 日付セル */
    .date-cell {
      border: 1px solid #999;
      padding: 2px 1px;
      text-align: center;
      vertical-align: top;
      font-weight: bold;
    }

    .date-cell .date-main {
      font-size: 6pt;
      margin-bottom: 1px;
    }

    /* 日曜日・祝日は赤色 */
    .date-cell.sunday .date-main,
    .date-cell.holiday .date-main {
      color: #c00;
    }

    /* 土曜日は青色 */
    .date-cell.saturday .date-main {
      color: #00c;
    }

    .date-cell .holiday-label {
      font-size: 4pt;
      color: #c00;
      font-weight: normal;
    }

    /* 部門セル */
    .dept-cell {
      border: 1px solid #ccc;
      padding: 2px 1px;
      vertical-align: top;
    }

    .dept-cell.empty {
      text-align: center;
      color: #999;
      font-size: 4pt;
    }

    /* シフトグループ */
    .shift-group {
      margin-bottom: 3px;
    }

    .shift-group:last-child {
      margin-bottom: 0;
    }

    .shift-type {
      font-weight: bold;
      font-size: 5pt;
      margin-bottom: 1px;
      color: #333;
    }

    .instructor {
      font-size: 4.5pt;
      padding-left: 4px;
      line-height: 1.2;
    }

    /* フッター */
    footer {
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px solid #999;
      text-align: left;
      font-size: 5pt;
      color: #666;
    }

    footer p {
      margin: 0;
    }
  `;
}
