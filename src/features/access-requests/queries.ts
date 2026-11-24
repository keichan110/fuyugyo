import { mutationOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { USERS_QUERY_KEY } from '@/features/users/queries';
import { client } from '@/lib/rpc';

import {
  accessRequestResponseSchema,
  pendingAccessRequestListSchema,
  rejectBatchResponseSchema,
  type ApproveAccessRequestInput,
  type PendingAccessRequest,
} from './schema';

/** 申請 API が成功以外を返したときのエラー。画面は HTTP ステータスで表示を分ける */
export class AccessRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('利用申請に失敗しました');
    this.status = status;
  }
}

/** 利用申請を送信する mutation 設定を返す */
export function submitAccessRequestMutationOptions() {
  return mutationOptions({
    mutationFn: async () => {
      const res = await client.api['access-requests'].$post();
      if (res.status !== 201) {
        throw new AccessRequestError(res.status);
      }
      return accessRequestResponseSchema.parse(await res.json());
    },
    // 401/403/409/429 は利用者の操作や状態で起きる想定内の失敗のため再試行しない
    retry: false,
  });
}

/** 利用申請を送信する。失敗時は `AccessRequestError` が `error` に入る */
export function useSubmitAccessRequest() {
  return useMutation(submitAccessRequestMutationOptions());
}

/** 承認待ち申請一覧のクエリキー。一覧・ナビの件数バッジが同じキャッシュを共有する */
export const ACCESS_REQUESTS_QUERY_KEY = ['access-requests'] as const;

/** 承認待ち件数を再取得する間隔（ミリ秒） */
const PENDING_REFETCH_INTERVAL_MS = 30_000;

/**
 * 承認待ちの利用申請を取得する（ADMIN のみ）。
 * ナビの件数バッジと一覧で同じクエリを共有する。30 秒ごと・画面への復帰時に再取得する。
 *
 * @param enabled - false の間は問い合わせない（ADMIN 以外では false にする）
 */
export function useAccessRequests(enabled: boolean) {
  return useQuery<PendingAccessRequest[]>({
    queryKey: ACCESS_REQUESTS_QUERY_KEY,
    enabled,
    staleTime: 0,
    refetchInterval: PENDING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await client.api['access-requests'].$get();
      if (!res.ok) {
        throw new Error('承認待ちの申請を取得できませんでした');
      }
      return pendingAccessRequestListSchema.parse(await res.json());
    },
  });
}

/** 管理操作の失敗ステータスから、利用者に見せる案内文を決める */
function adminFailureMessage(status: number, fallback: string): string {
  if (status === 404) return 'この申請は既に処理されたか、期限が切れています。一覧を更新しました。';
  if (status === 409)
    return '既に登録済みか、選んだインストラクターは別のユーザーに紐付いています。';
  return fallback;
}

/** 申請を承認して MEMBER を作成する。成功後は申請一覧とユーザー一覧を無効化する */
export function useApproveAccessRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ApproveAccessRequestInput>({
    mutationFn: async (input) => {
      const res = await client.api['access-requests'][':id'].approve.$post({
        param: { id },
        json: input,
      });
      if (res.status !== 201) {
        throw new Error(
          adminFailureMessage(res.status, '承認に失敗しました。もう一度お試しください。'),
        );
      }
    },
    onSettled: (_data, error) => {
      // 404 など既に処理済みの場合も一覧を最新にするため、失敗時も申請一覧は更新する
      void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
      if (!error) void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/** 申請を 1 件却下（削除）する。成功後は申請一覧を無効化する */
export function useRejectAccessRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await client.api['access-requests'][':id'].$delete({ param: { id } });
      // 204 は削除済み。404 は他の操作で既に処理済みのため、目的は達成されている
      if (res.status !== 204 && res.status !== 404) {
        throw new Error('却下に失敗しました。もう一度お試しください。');
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    },
  });
}

/** 選択した申請をまとめて却下する。成功後は申請一覧を無効化し、削除件数を返す */
export function useRejectAccessRequests() {
  const queryClient = useQueryClient();
  return useMutation<number, Error, string[]>({
    mutationFn: async (ids) => {
      const res = await client.api['access-requests']['reject-batch'].$post({ json: { ids } });
      if (!res.ok) {
        throw new Error('却下に失敗しました。もう一度お試しください。');
      }
      return rejectBatchResponseSchema.parse(await res.json()).deletedCount;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    },
  });
}
