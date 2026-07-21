/** 未認証時にログインへ遷移するためのルート指定。 */
export type UnauthenticatedRedirect = {
  to: '/login';
  search: { redirect: string };
  replace: true;
};

/**
 * 未認証で表示してよいルートかを判定し、保護ルートならログインへの遷移先を返す。
 * @param pathname - 現在表示しているパス
 */
export function getUnauthenticatedRedirect(pathname: string): UnauthenticatedRedirect | null {
  if (pathname === '/login') {
    return null;
  }
  return {
    to: '/login',
    search: { redirect: pathname },
    replace: true,
  };
}
