/** 未認証時にログインへ遷移するためのルート指定。 */
export type UnauthenticatedRedirect = {
  to: '/login';
  search: { redirect: string };
  replace: true;
};

/** 未認証でも表示できるパス（ログイン・利用申請の各画面） */
const PUBLIC_PATHS: readonly string[] = ['/login', '/access-request', '/access-request/pending'];

/**
 * 未認証で表示してよいルートかを判定し、保護ルートならログインへの遷移先を返す。
 * @param pathname - 現在表示しているパス
 * @param redirectPath - 認証後に戻す現在地（クエリを含む）
 */
export function getUnauthenticatedRedirect(
  pathname: string,
  redirectPath = pathname,
): UnauthenticatedRedirect | null {
  if (PUBLIC_PATHS.includes(pathname.replace(/(.)\/$/, '$1'))) {
    return null;
  }
  return {
    to: '/login',
    search: { redirect: redirectPath },
    replace: true,
  };
}
