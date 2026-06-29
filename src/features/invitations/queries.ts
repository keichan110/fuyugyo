import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { client } from '@/lib/rpc';
import {
  type CreateInvitationInput,
  type Invitation,
  type VerifyInvitationResponse,
  invitationListSchema,
  invitationSchema,
  verifyInvitationResponseSchema,
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

/** 招待トークン一覧を取得する（ADMIN/MANAGER のみ）。 */
export function useInvitations() {
  return useQuery<Invitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
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
 * 招待トークンを作成するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation<Invitation, Error, CreateInvitationInput>({
    mutationFn: async (input) => {
      const res = await client.api.invitations.$post({ json: input });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待の作成に失敗しました'));
      }
      return invitationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

/**
 * 招待トークンを無効化するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useDeactivateInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation<Invitation, Error, void>({
    mutationFn: async () => {
      const res = await client.api.invitations[':token'].deactivate.$post({
        param: { token },
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待の無効化に失敗しました'));
      }
      return invitationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

/**
 * 招待トークンを検証するクエリ（未認証で使用可能）。
 * 有効な場合は公開用の招待情報（token・expiresAt・description）を返す。
 */
export function useVerifyInvitation(token: string | null) {
  return useQuery<VerifyInvitationResponse>({
    queryKey: ['invitations', 'verify', token],
    queryFn: async () => {
      if (!token) throw new Error('トークンが指定されていません');
      const res = await client.api.invitations[':token'].verify.$get({
        param: { token },
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, '招待の検証に失敗しました'));
      }
      return verifyInvitationResponseSchema.parse(await res.json());
    },
    enabled: !!token,
    retry: false,
  });
}
