import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import { meResponseSchema, type LinkInstructorInput, type MeResponse } from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** 認証状態のクエリキー */
export const ME_QUERY_KEY = ['auth', 'me'] as const;

/** 本人確認クエリを、マウント・フォーカス・ルート遷移のたびに再検証する設定で返す。 */
export function meQueryOptions() {
  return queryOptions<MeResponse | null>({
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
    // 認証主体の取り違えを防ぐため、本人確認はグローバルの staleTime（60s）でマスクしない
    staleTime: 0,
  });
}

/**
 * 現在ログイン中の User を取得する（/me 相当）。
 * 401 の場合は未認証として `null` を返し、エラー扱いにしない。
 */
export function useMe() {
  return useQuery(meQueryOptions());
}

/** 認証済みキャッシュを全て破棄し、同じ QueryClient を未認証状態へ切り替える。 */
export function clearAuthenticatedCache(queryClient: QueryClient): void {
  queryClient.clear();
  queryClient.setQueryData(ME_QUERY_KEY, null);
}

/** ログアウト成功時に認証済みキャッシュを破棄する mutation 設定を返す。 */
export function logoutMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async () => {
      const res = await client.api.auth.logout.$post();
      if (!res.ok) {
        throw new Error('ログアウトに失敗しました');
      }
    },
    onSuccess: () => {
      // 後続の別 User セッションに前 User の統計・勤務可否等を残さない
      clearAuthenticatedCache(queryClient);
    },
  });
}

/**
 * ログアウトする。成功後は認証済みの全キャッシュを破棄する。
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation(logoutMutationOptions(queryClient));
}

/**
 * 自分自身を Instructor にリンクするミューテーション（セルフサービス）。
 * 成功後は返却された最新の User で認証状態キャッシュを直接更新する。
 */
export function useLinkInstructor() {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, Error, LinkInstructorInput>({
    mutationFn: async (input) => {
      const res = await client.api.auth.me['link-instructor'].$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターの連携に失敗しました');
      }
      return meResponseSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

/**
 * 自分自身の Instructor リンクを解除するミューテーション（セルフサービス）。
 * 成功後は返却された最新の User で認証状態キャッシュを直接更新する。
 */
export function useUnlinkInstructor() {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, Error, void>({
    mutationFn: async () => {
      const res = await client.api.auth.me['link-instructor'].$delete();
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターの連携解除に失敗しました');
      }
      return meResponseSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}
