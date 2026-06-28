import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { client } from '@/lib/rpc';
import {
  type CreateDepartmentInput,
  type Department,
  type UpdateDepartmentInput,
  departmentListSchema,
  departmentSchema,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** Department 関連クエリキー */
export const DEPARTMENTS_QUERY_KEY = ['departments'] as const;

/**
 * 部門一覧を取得する。
 * @param activeOnly - true（デフォルト）のときアクティブな部門のみ返す
 */
export function useDepartments(activeOnly = true) {
  return useQuery<Department[]>({
    queryKey: [...DEPARTMENTS_QUERY_KEY, { activeOnly }],
    queryFn: async () => {
      const res = await client.api.departments.$get({
        query: activeOnly ? {} : { active: 'false' },
      });
      if (!res.ok) {
        throw new Error('部門一覧の取得に失敗しました');
      }
      return departmentListSchema.parse(await res.json());
    },
  });
}

/**
 * 部門を1件取得する。
 * @param id - 対象部門の ID
 */
export function useDepartment(id: string) {
  return useQuery<Department>({
    queryKey: [...DEPARTMENTS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await client.api.departments[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('部門の取得に失敗しました');
      }
      return departmentSchema.parse(await res.json());
    },
  });
}

/**
 * 部門を作成するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation<Department, Error, CreateDepartmentInput>({
    mutationFn: async (input) => {
      const res = await client.api.departments.$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '部門の作成に失敗しました');
      }
      return departmentSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
    },
  });
}

/**
 * 部門情報を更新するミューテーション。
 * 成功後は該当部門と一覧キャッシュを無効化する。
 */
export function useUpdateDepartment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Department, Error, UpdateDepartmentInput>({
    mutationFn: async (input) => {
      const res = await client.api.departments[':id'].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '部門の更新に失敗しました');
      }
      return departmentSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
    },
  });
}

/**
 * 部門を無効化するミューテーション（論理削除）。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useDeactivateDepartment() {
  const queryClient = useQueryClient();
  return useMutation<Department, Error, string>({
    mutationFn: async (id) => {
      const res = await client.api.departments[':id'].deactivate.$post({
        param: { id },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '部門の無効化に失敗しました');
      }
      return departmentSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
    },
  });
}
