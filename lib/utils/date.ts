/**
 * タイムゾーン安全な日付処理ユーティリティ
 *
 * @remarks
 * このファイルは、タイムゾーンの違いによる日付のずれを防ぐための
 * 統一的な日付処理関数を提供します。
 *
 * 基本方針:
 * - 日付文字列 "YYYY-MM-DD" はローカル日付として扱う（時刻情報は持たない）
 * - Date オブジェクトを生成する際は、必ずローカルタイムゾーンで年月日を指定
 * - UTC 変換は避け、常にローカルタイムゾーンベースで処理
 */

/**
 * YYYY-MM-DD形式の日付文字列を検証する正規表現
 *
 * @remarks
 * - 年: 4桁の数字（0000-9999）
 * - 月: 2桁の数字（01-12）、ゼロパディング必須
 * - 日: 2桁の数字（01-31）、ゼロパディング必須
 * - 区切り文字: ハイフン（-）のみ
 */
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 月の最小値（1月）
 */
const MIN_MONTH = 1;

/**
 * 月の最大値（12月）
 */
const MAX_MONTH = 12;

/**
 * 日付文字列を分割したときの配列インデックス
 */
const YEAR_INDEX = 0;
const MONTH_INDEX = 1;
const DAY_INDEX = 2;

/**
 * YYYY-MM-DD形式の日付文字列を厳密に検証
 *
 * @param dateString - 検証する日付文字列
 * @returns 検証結果（成功時はnull、失敗時はエラーメッセージ）
 *
 * @example
 * ```typescript
 * validateDateFormat("2025-12-29"); // null（正常）
 * validateDateFormat("2025-1-5");   // エラー: ゼロパディングが必要
 * validateDateFormat("2025/12/29"); // エラー: 区切り文字が不正
 * validateDateFormat("2025-13-01"); // エラー: 月が範囲外
 * validateDateFormat("2025-12-32"); // エラー: 日が範囲外
 * ```
 */
export function validateDateFormat(dateString: string): string | null {
  // 形式チェック: YYYY-MM-DD
  if (!DATE_FORMAT_REGEX.test(dateString)) {
    return `不正な日付形式です: "${dateString}"。YYYY-MM-DD形式で指定してください（例: "2025-12-29"）`;
  }

  const parts = dateString.split("-");

  // 正規表現でマッチしているので、parts は必ず3要素を持つ
  const yearStr = parts[YEAR_INDEX];
  const monthStr = parts[MONTH_INDEX];
  const dayStr = parts[DAY_INDEX];

  if (!(yearStr && monthStr && dayStr)) {
    return `不正な日付形式です: "${dateString}"。YYYY-MM-DD形式で指定してください`;
  }

  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  // 月の範囲チェック（1-12）
  if (month < MIN_MONTH || month > MAX_MONTH) {
    return `不正な月です: ${month}。月は01から12の範囲で指定してください`;
  }

  // その月の最大日数を取得
  const maxDay = new Date(year, month, 0).getDate();

  // 日の範囲チェック（1-最大日数）
  if (day < 1 || day > maxDay) {
    return `不正な日です: ${day}。${year}-${String(month).padStart(2, "0")}の日は01から${String(maxDay).padStart(2, "0")}の範囲で指定してください`;
  }

  // Dateオブジェクトとして有効かチェック
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return `不正な日付です: "${dateString}"は有効なカレンダー日付ではありません`;
  }

  return null; // 検証成功
}

/**
 * YYYY-MM-DD形式の日付文字列をローカルタイムゾーンのDateオブジェクトに変換
 *
 * @remarks
 * `new Date("2025-12-29")` はUTC深夜0時として解釈されるため、
 * タイムゾーンがUTC+9の場合、実質的に前日の扱いになってしまう。
 * この関数は、文字列をパースしてローカル日付としてDateオブジェクトを生成する。
 *
 * バリデーション:
 * - YYYY-MM-DD形式の厳密なチェック（ゼロパディング必須）
 * - 月（01-12）、日（01-31）の範囲チェック
 * - 実在する日付かどうかのチェック（例: 2月30日はエラー）
 *
 * @param dateString - YYYY-MM-DD形式の日付文字列
 * @returns ローカルタイムゾーンでの深夜0時のDateオブジェクト
 * @throws 不正な日付形式の場合はエラーをスロー
 *
 * @example
 * ```typescript
 * // タイムゾーンがJST（UTC+9）の環境で
 * const date1 = new Date("2025-12-29"); // UTC 2025-12-29 00:00 = JST 2025-12-29 09:00
 * const date2 = parseLocalDate("2025-12-29"); // JST 2025-12-29 00:00
 *
 * // エラーケース
 * parseLocalDate("2025-1-5");   // Error: ゼロパディング必須
 * parseLocalDate("2025/12/29"); // Error: 区切り文字が不正
 * parseLocalDate("2025-13-01"); // Error: 月が範囲外
 * parseLocalDate("2025-02-30"); // Error: 2月に30日は存在しない
 * ```
 */
export function parseLocalDate(dateString: string): Date {
  // バリデーション実行
  const validationError = validateDateFormat(dateString);
  if (validationError) {
    throw new Error(validationError);
  }

  const parts = dateString.split("-");

  // バリデーション済みなので、parts は必ず3要素を持ち、各要素は有効な数値文字列
  const yearStr = parts[YEAR_INDEX];
  const monthStr = parts[MONTH_INDEX];
  const dayStr = parts[DAY_INDEX];

  if (!(yearStr && monthStr && dayStr)) {
    throw new Error(`不正な日付形式です: "${dateString}"`);
  }

  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  // 月は0始まりなので -1 する
  return new Date(year, month - 1, day);
}

/**
 * Dateオブジェクトをローカル日付のYYYY-MM-DD形式文字列に変換
 *
 * @remarks
 * `date.toISOString()` はUTC基準で文字列化されるため、
 * ローカルタイムゾーンがUTC以外の場合、日付がずれる可能性がある。
 * この関数は、Dateオブジェクトのローカル日付部分を取り出して文字列化する。
 *
 * @param date - 変換するDateオブジェクト
 * @returns YYYY-MM-DD形式の日付文字列
 *
 * @example
 * ```typescript
 * const date = new Date(2025, 11, 29); // 2025年12月29日 (月は0始まり)
 * formatLocalDate(date); // "2025-12-29"
 * ```
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 現在のローカル日付をYYYY-MM-DD形式で取得
 *
 * @returns 今日の日付（YYYY-MM-DD形式）
 *
 * @example
 * ```typescript
 * getTodayLocalDate(); // "2025-12-17"
 * ```
 */
export function getTodayLocalDate(): string {
  const now = new Date();
  return formatLocalDate(now);
}

/**
 * 指定日付からN日後の日付を取得
 *
 * @remarks
 * タイムゾーン安全な日付加算を行う。
 * 時刻情報を持たない純粋な日付として計算する。
 *
 * @param dateString - 基準となる日付（YYYY-MM-DD形式）
 * @param days - 加算する日数（負の値で過去の日付）
 * @returns N日後の日付（YYYY-MM-DD形式）
 *
 * @example
 * ```typescript
 * addDays("2025-12-29", 6); // "2026-01-04"
 * addDays("2025-12-29", -1); // "2025-12-28"
 * ```
 */
export function addDays(dateString: string, days: number): string {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

/**
 * 指定月の開始日と終了日を取得
 *
 * @param year - 年（例: 2025）
 * @param month - 月（1-12）
 * @returns 月の開始日と終了日のオブジェクト
 *
 * @example
 * ```typescript
 * getMonthRange(2025, 1);
 * // { start: "2025-01-01", end: "2025-01-31" }
 *
 * getMonthRange(2025, 2);
 * // { start: "2025-02-01", end: "2025-02-28" }
 * ```
 */
export function getMonthRange(
  year: number,
  month: number
): { start: string; end: string } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // 翌月の0日目 = 当月末日

  return {
    start: formatLocalDate(startDate),
    end: formatLocalDate(endDate),
  };
}

/**
 * 指定日付から始まる週の開始日と終了日を取得
 *
 * @param dateString - 週の開始日（YYYY-MM-DD形式）
 * @param weekLength - 週の長さ（日数、デフォルト: 7）
 * @returns 週の開始日と終了日のオブジェクト
 *
 * @example
 * ```typescript
 * getWeekRange("2025-12-29");
 * // { start: "2025-12-29", end: "2026-01-04" }
 *
 * getWeekRange("2025-12-29", 5);
 * // { start: "2025-12-29", end: "2026-01-02" }
 * ```
 */
export function getWeekRange(
  dateString: string,
  weekLength = 7
): { start: string; end: string } {
  const endDate = addDays(dateString, weekLength - 1);

  return {
    start: dateString,
    end: endDate,
  };
}
