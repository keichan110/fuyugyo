/**
 * シーズン境界の共通定数。
 *
 * 期の切り替わり（9月）を起点に「シーズン」を定義する。実際の営業開始（例年12月頃）より
 * 前倒しだが、勤務実績の集計・比較（今シーズン／前シーズン）はこの期区切りに揃える。
 * サーバー・クライアント双方から参照する isomorphic な単一の情報源とし、
 * DB や環境変数には持たない。
 */

/** シーズン開始月（1〜12） */
export const SEASON_START_MONTH = 9;

/** シーズン終了月（1〜12） */
export const SEASON_END_MONTH = 8;

/**
 * シーズン開始年から、スキー・スノーボード業界の慣習に沿ったシーズン名を返す
 * （例: 2026 → 「26-27シーズン」）。年をまたがない設定なら「26シーズン」とする。
 * @param startYear - シーズン開始年（西暦4桁）
 * @returns シーズン名
 */
export function seasonName(startYear: number): string {
  const twoDigits = (year: number) => String(year % 100).padStart(2, '0');
  return SEASON_START_MONTH > SEASON_END_MONTH
    ? `${twoDigits(startYear)}-${twoDigits(startYear + 1)}シーズン`
    : `${twoDigits(startYear)}シーズン`;
}
