import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  invitationListSchema,
  invitationSchema,
  type Invitation,
  type InvitationListItem,
} from './schema';

/** API エラーレスポンスのスキーマ */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** APIエラーレスポンスのメッセージを安全に取り出す。パース失敗時はfallbackを返す */
async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const parsed = apiErrorSchema.safeParse(await res.json().catch(() => ({})));
  return parsed.success ? (parsed.data.message ?? fallback) : fallback;
}

/** Invitation 関連クエリキー */
export const INVITATIONS_QUERY_KEY = ['invitations'] as const;

/**
 * 有効な招待リンク一覧を取得する（ADMIN のみ）。
 * @param enabled - false の間は取得しない（モーダルを開くまで呼ばない）
 */
export function useInvitations(enabled: boolean) {
  return useQuery<InvitationListItem[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    enabled,
    queryFn: async () => {
      const res = await client.api.invitations.$get();
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待一覧の取得に失敗しました'));
      }
      return invitationListSchema.parse(await res.json());
    },
  });
}

/**
 * 招待リンクを発行（または1時間以内の既存リンクを再取得）するミューテーション。
 * 成功後は一覧を再取得し終えてから完了とする（表示中のリンクが一覧に残っているかを最新の状態で判定できるように）。
 */
export function useIssueInvitation() {
  const queryClient = useQueryClient();
  return useMutation<Invitation, Error, void>({
    mutationFn: async () => {
      const res = await client.api.invitations.$post();
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待リンクの発行に失敗しました'));
      }
      return invitationSchema.parse(await res.json());
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

/**
 * 招待リンクを停止するミューテーション。引数に停止するトークンを渡す。
 * 成功後は一覧を再取得し終えてから完了とする。
 */
export function useDeactivateInvitation() {
  const queryClient = useQueryClient();
  return useMutation<Invitation, Error, string>({
    mutationFn: async (token) => {
      const res = await client.api.invitations[':token'].deactivate.$post({ param: { token } });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待リンクの停止に失敗しました'));
      }
      return invitationSchema.parse(await res.json());
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}
