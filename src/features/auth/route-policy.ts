/** 未認証時にログインへ遷移するためのルート指定。 */
export type UnauthenticatedRedirect = {
  to: '/login';
  search: { redirect: string };
  replace: true;
};

/** 利用申請系の単独表示パス（申請画面・承認待ち画面） */
const ACCESS_REQUEST_PATHS: readonly string[] = ['/access-request', '/access-request/pending'];

/** 未認証でも表示できるパス（ログイン画面と利用申請系の各画面） */
const PUBLIC_PATHS: readonly string[] = ['/login', ...ACCESS_REQUEST_PATHS];

/** 末尾スラッシュを除いたパスにそろえる */
function normalizePathname(pathname: string): string {
  return pathname.replace(/(.)\/$/, '$1');
}

/**
 * 利用申請系の単独表示画面（申請画面・承認待ち画面）かを判定する。
 * 該当パスは認証状態にかかわらずアプリシェルなしで表示する（旧セッションが残っていても申請できるようにするため）。
 * @param pathname - 現在表示しているパス（末尾スラッシュは無視する）
 */
export function isAccessRequestPath(pathname: string): boolean {
  return ACCESS_REQUEST_PATHS.includes(normalizePathname(pathname));
}

/**
 * 未認証で表示してよいルートかを判定し、保護ルートならログインへの遷移先を返す。
 * @param pathname - 現在表示しているパス
 * @param redirectPath - 認証後に戻す現在地（クエリを含む）
 */
export function getUnauthenticatedRedirect(
  pathname: string,
  redirectPath = pathname,
): UnauthenticatedRedirect | null {
  if (PUBLIC_PATHS.includes(normalizePathname(pathname))) {
    return null;
  }
  return {
    to: '/login',
    search: { redirect: redirectPath },
    replace: true,
  };
}
