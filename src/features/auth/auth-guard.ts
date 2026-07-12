import type { QueryClient } from '@tanstack/react-query';

import { client } from '@/lib/rpc';

import { ME_QUERY_KEY } from './queries';
import { meResponseSchema, type MeResponse } from './schema';

/**
 * 現在の認証状態を取得する（未認証なら null）。
 * TanStack Query のキャッシュを共有し、ルートガードとコンポーネント表示で同じ結果を使う。
 * 親レイアウトルートで `ensureAuthenticated` を通過した後、子ルートでロールなどの追加チェックを
 * 行うときはこの関数を使うとキャッシュヒットで済み、余分な API 呼び出しが発生しない。
 */
export async function fetchMe(queryClient: QueryClient): Promise<MeResponse | null> {
  return await queryClient.fetchQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api.auth.me.$get();
      if (res.status === 401 || res.status === 403) {
        return null;
      }
      if (!res.ok) {
        throw new Error('ユーザー情報の取得に失敗しました');
      }
      return meResponseSchema.parse(await res.json());
    },
  });
}

/**
 * 認証必須ルートのガード。未認証なら現在地を `redirect` に積んで返す（呼び出し側で `redirect()` する）。
 *
 * @param queryClient - ルーターコンテキストの QueryClient
 * @param currentPath - 認証後に戻すための現在パス
 * @returns 認証済みなら User、未認証ならログインへのリダイレクト先
 */
export async function ensureAuthenticated(
  queryClient: QueryClient,
  currentPath: string,
): Promise<{ authenticated: true; user: MeResponse } | { authenticated: false; loginTo: string }> {
  const user = await fetchMe(queryClient);
  if (user) {
    return { authenticated: true, user };
  }
  const params = new URLSearchParams({ redirect: currentPath });
  return { authenticated: false, loginTo: `/login?${params.toString()}` };
}

/** ログインページ用。既に認証済みかどうかを返す（認証済みなら遷移先を弾く） */
export async function isAuthenticated(queryClient: QueryClient): Promise<boolean> {
  return (await fetchMe(queryClient)) !== null;
}
