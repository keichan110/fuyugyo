/**
 * APIキャッシュ設定の定数定義
 *
 * @description
 * React QueryやSWRなどのデータフェッチングライブラリで使用する
 * キャッシュ時間の設定を一元管理します。
 */

/**
 * シフトデータ用キャッシュ設定
 *
 * @description
 * シフトデータは頻繁に更新される可能性があるため、
 * 比較的短いキャッシュ時間を設定しています。
 */
export const SHIFT_CACHE_CONFIG = {
  /**
   * staleTime: データが新鮮とみなされる期間（2分）
   *
   * この期間内は、キャッシュされたデータを使用し、
   * 新たなリクエストは発行されません。
   */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  STALE_TIME_MS: 1000 * 60 * 2,

  /**
   * gcTime: キャッシュがメモリに保持される期間（5分）
   *
   * この期間を過ぎると、キャッシュはガベージコレクションの対象となります。
   */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  GC_TIME_MS: 1000 * 60 * 5,
} as const;

/**
 * フォームデータ用キャッシュ設定
 *
 * @description
 * フォームデータ（部門、シフト種別など）は比較的変更頻度が低いため、
 * 長めのキャッシュ時間を設定しています。
 */
export const FORM_DATA_CACHE_CONFIG = {
  /** staleTime: 5分 */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  STALE_TIME_MS: 1000 * 60 * 5,

  /** gcTime: 10分 */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  GC_TIME_MS: 1000 * 60 * 10,
} as const;

/**
 * インストラクターデータ用キャッシュ設定
 *
 * @description
 * インストラクターデータは中程度の変更頻度を想定しています。
 */
export const INSTRUCTOR_CACHE_CONFIG = {
  /** staleTime: 3分 */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  STALE_TIME_MS: 1000 * 60 * 3,

  /** gcTime: 5分 */
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間の分数は可読性重視のため定数化しない
  GC_TIME_MS: 1000 * 60 * 5,
} as const;
