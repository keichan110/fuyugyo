import type { PendingAccessRequest } from './schema';

/**
 * 申請の接続元から推定した位置の表示文字列を返す（国・地域・市区町村の順）。
 * Cloudflare が付与する目安の値で、どれも取得できていなければ「不明」にする。
 *
 * @param request - 承認待ちの申請
 */
export function formatRequestLocation(
  request: Pick<PendingAccessRequest, 'country' | 'region' | 'city'>,
): string {
  const parts = [request.country, request.region, request.city].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? '不明' : parts.join(' ');
}
