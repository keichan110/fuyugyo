/**
 * 日付フォーマット関連のユーティリティ関数
 * Fuyugyō - 運営管理システム用
 */

export type DateFormatOptions = {
  includeWeekday?: boolean;
  format?: "long" | "short" | "numeric";
};

/**
 * 日付を日本語形式でフォーマットする共通関数
 * @param dateString - フォーマットする日付文字列
 * @param options - フォーマットオプション
 * @returns フォーマットされた日付文字列
 */
export function formatDateForDisplay(
  dateString: string,
  options: DateFormatOptions = {}
): string {
  const { includeWeekday = true, format = "long" } = options;

  // 不正な入力のチェック
  if (!dateString || dateString.trim() === "" || dateString === "null") {
    return dateString;
  }

  try {
    const date = new Date(dateString);

    // Invalid Dateのチェック
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    let dateStr: string;
    if (format === "short") {
      // short形式の場合は 2024/3/15 形式
      dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    } else {
      dateStr = date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: format,
        day: "numeric",
      });
    }

    if (includeWeekday) {
      const weekdayStr = date.toLocaleDateString("ja-JP", {
        weekday: "short",
      });
      return `${dateStr}（${weekdayStr}）`;
    }

    return dateStr;
  } catch {
    return dateString;
  }
}
