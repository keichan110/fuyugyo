/** 未承認の利用申請の上限件数（自分以外の申請がこの件数に達すると新規申請を受け付けない） */
export const ACCESS_REQUEST_LIMIT = 20;

/** 利用申請の有効日数。これを過ぎた申請は callback で未申請扱いにし、申請 API と Cron の定期削除で削除する */
export const ACCESS_REQUEST_EXPIRES_DAYS = 7;

/**
 * 申請の有効期限の境界時刻を返す。この時刻より前に申請したものは期限切れ。
 *
 * @param now - 基準時刻
 */
export function accessRequestCutoff(now: Date): Date {
  return new Date(now.getTime() - ACCESS_REQUEST_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}
