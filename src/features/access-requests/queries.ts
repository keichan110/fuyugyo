import { mutationOptions, useMutation } from '@tanstack/react-query';

import { client } from '@/lib/rpc';

import { accessRequestResponseSchema } from './schema';

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
