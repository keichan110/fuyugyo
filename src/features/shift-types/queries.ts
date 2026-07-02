import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  shiftTypeListSchema,
  shiftTypeSchema,
  type CreateShiftTypeInput,
  type ShiftType,
  type UpdateShiftTypeInput,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** ShiftType 関連クエリキー */
export const SHIFT_TYPES_QUERY_KEY = ['shift-types'] as const;

/**
 * シフト種別一覧を取得する。
 * @param activeOnly - true（デフォルト）のときアクティブなシフト種別のみ返す
 */
export function useShiftTypes(activeOnly = true) {
  return useQuery<ShiftType[]>({
    queryKey: [...SHIFT_TYPES_QUERY_KEY, { activeOnly }],
    queryFn: async () => {
      const res = await client.api['shift-types'].$get({
        query: activeOnly ? {} : { active: 'false' },
      });
      if (!res.ok) {
        throw new Error('シフト種別一覧の取得に失敗しました');
      }
      return shiftTypeListSchema.parse(await res.json());
    },
  });
}

/**
 * シフト種別を1件取得する。
 * @param id - 対象シフト種別の ID
 */
export function useShiftType(id: string) {
  return useQuery<ShiftType>({
    queryKey: [...SHIFT_TYPES_QUERY_KEY, id],
    queryFn: async () => {
      const res = await client.api['shift-types'][':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('シフト種別の取得に失敗しました');
      }
      return shiftTypeSchema.parse(await res.json());
    },
  });
}

/**
 * シフト種別を作成するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useCreateShiftType() {
  const queryClient = useQueryClient();
  return useMutation<ShiftType, Error, CreateShiftTypeInput>({
    mutationFn: async (input) => {
      const res = await client.api['shift-types'].$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフト種別の作成に失敗しました');
      }
      return shiftTypeSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFT_TYPES_QUERY_KEY });
    },
  });
}

/**
 * シフト種別名を更新するミューテーション。
 * 成功後は該当シフト種別と一覧キャッシュを無効化する。
 */
export function useUpdateShiftType(id: string) {
  const queryClient = useQueryClient();
  return useMutation<ShiftType, Error, UpdateShiftTypeInput>({
    mutationFn: async (input) => {
      const res = await client.api['shift-types'][':id'].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフト種別の更新に失敗しました');
      }
      return shiftTypeSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFT_TYPES_QUERY_KEY });
    },
  });
}

/**
 * シフト種別を無効化するミューテーション（論理削除）。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useDeactivateShiftType() {
  const queryClient = useQueryClient();
  return useMutation<ShiftType, Error, string>({
    mutationFn: async (id) => {
      const res = await client.api['shift-types'][':id'].deactivate.$post({
        param: { id },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフト種別の無効化に失敗しました');
      }
      return shiftTypeSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFT_TYPES_QUERY_KEY });
    },
  });
}
