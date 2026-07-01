import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  certificationListSchema,
  certificationSchema,
  type Certification,
  type CreateCertificationInput,
  type UpdateCertificationInput,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** Certification 関連クエリキー */
export const CERTIFICATIONS_QUERY_KEY = ['certifications'] as const;

/**
 * 資格一覧を取得する。
 * @param activeOnly - true（デフォルト）のときアクティブな資格のみ返す
 * @param departmentId - 指定すると特定の Department に絞り込む
 */
export function useCertifications(activeOnly = true, departmentId?: string) {
  return useQuery<Certification[]>({
    queryKey: [...CERTIFICATIONS_QUERY_KEY, { activeOnly, departmentId }],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (!activeOnly) query['active'] = 'false';
      if (departmentId) query['departmentId'] = departmentId;

      const res = await client.api.certifications.$get({ query });
      if (!res.ok) {
        throw new Error('資格一覧の取得に失敗しました');
      }
      return certificationListSchema.parse(await res.json());
    },
  });
}

/**
 * 資格を1件取得する。
 * @param id - 対象資格の ID
 */
export function useCertification(id: string) {
  return useQuery<Certification>({
    queryKey: [...CERTIFICATIONS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await client.api.certifications[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('資格の取得に失敗しました');
      }
      return certificationSchema.parse(await res.json());
    },
  });
}

/**
 * 資格を作成するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useCreateCertification() {
  const queryClient = useQueryClient();
  return useMutation<Certification, Error, CreateCertificationInput>({
    mutationFn: async (input) => {
      const res = await client.api.certifications.$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '資格の作成に失敗しました');
      }
      return certificationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * 資格情報を更新するミューテーション。
 * 成功後は該当資格と一覧キャッシュを無効化する。
 */
export function useUpdateCertification(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Certification, Error, UpdateCertificationInput>({
    mutationFn: async (input) => {
      const res = await client.api.certifications[':id'].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '資格の更新に失敗しました');
      }
      return certificationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * 資格を無効化するミューテーション（論理削除）。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useDeactivateCertification() {
  const queryClient = useQueryClient();
  return useMutation<Certification, Error, string>({
    mutationFn: async (id) => {
      const res = await client.api.certifications[':id'].deactivate.$post({
        param: { id },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '資格の無効化に失敗しました');
      }
      return certificationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY });
    },
  });
}
