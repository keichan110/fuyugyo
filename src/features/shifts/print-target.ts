/**
 * 印刷ダイアログの初期月を決める日付選択。
 * スクロール中に更新される URL の日付（表示割合ベース）ではなく、ボタンを押した時点の
 * 表示位置から「画面内の最上部に見える日付」を選ぶ。DOM 計測は呼び出し側で行い、
 * ここでは座標だけを入力とする純粋関数に保つ。
 */

/** 画面上に配置された勤務日1件の位置（getBoundingClientRect と同じ座標系） */
export type AgendaDateRect = {
  /** 勤務日（YYYY-MM-DD） */
  date: string;
  /** 要素の上端 */
  top: number;
  /** 要素の下端 */
  bottom: number;
};

/**
 * 表示領域の最上部に見えている勤務日を選ぶ。
 * 一部でも表示領域に掛かっていれば見えているものとして扱い、
 * 見えている日付が無ければ呼び出し側が渡す日付（URL の日付）をそのまま返す。
 * @param params - 勤務日の位置一覧・表示領域の上下端・見えないときに使う日付
 * @returns 選ばれた勤務日（YYYY-MM-DD）
 */
export function pickPrintTargetDate(params: {
  rects: AgendaDateRect[];
  /** 表示領域の上端（固定ヘッダーに隠れる分を除いた位置） */
  viewportTop: number;
  /** 表示領域の下端 */
  viewportBottom: number;
  /** 表示領域に日付が見えないときに使う日付（YYYY-MM-DD） */
  fallbackDate: string;
}): string {
  let topmost: AgendaDateRect | null = null;
  for (const rect of params.rects) {
    if (rect.bottom <= params.viewportTop || rect.top >= params.viewportBottom) {
      continue;
    }
    // 同じ高さに複数の勤務枠が並ぶ日境界では、先に始まる日付を最上部とみなす
    if (
      topmost === null ||
      rect.top < topmost.top ||
      (rect.top === topmost.top && rect.date < topmost.date)
    ) {
      topmost = rect;
    }
  }
  return topmost?.date ?? params.fallbackDate;
}
