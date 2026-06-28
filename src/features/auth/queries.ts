import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/rpc';
import { type MeResponse, meResponseSchema } from './schema';

/** 認証状態のクエリキー */
export const ME_QUERY_KEY = ['auth', 'me'] as const;

/**
 * 現在ログイン中の User を取得する（/me 相当）。
 * 401 の場合は未認証として `null` を返し、エラー扱いにしない。
 */
export function useMe() {
  return useQuery<MeResponse | null>({
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
 * ログアウトする。成功後は認証状態キャッシュを無効化する。
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.api.auth.logout.$post();
      if (!res.ok) {
        throw new Error('ログアウトに失敗しました');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}
