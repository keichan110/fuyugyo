import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { DepartmentCode } from '@/features/departments/schema';
import { client } from '@/lib/rpc';

import {
  departmentShiftTypeListSchema,
  type DepartmentShiftType,
  type DepartmentShiftTypeUpdateInput,
} from './schema';

/** 部門別シフト種別関連クエリの共通キー */
export const DEPARTMENT_SHIFT_TYPES_QUERY_KEY = ['department-shift-types'] as const;

/** API エラーレスポンスのスキーマ */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** 指定部門で利用可能なシフト種別を表示順で取得する。 */
export function useDepartmentShiftTypes(departmentCode: DepartmentCode) {
  return useQuery<DepartmentShiftType[]>({
    queryKey: [...DEPARTMENT_SHIFT_TYPES_QUERY_KEY, departmentCode],
    queryFn: async () => {
      const res = await client.api['department-shift-types'][':departmentCode'].$get({
        param: { departmentCode },
      });
      if (!res.ok) {
        throw new Error('部門別シフト種別の取得に失敗しました');
      }
      return departmentShiftTypeListSchema.parse(await res.json());
    },
  });
}

/**
 * 指定部門のシフト種別と表示順を一括更新する。
 * 成功レスポンスで一覧キャッシュを更新し、操作結果を即座に表示へ反映する。
 */
export function useUpdateDepartmentShiftTypes(departmentCode: DepartmentCode) {
  const queryClient = useQueryClient();

  return useMutation<DepartmentShiftType[], Error, DepartmentShiftTypeUpdateInput>({
    mutationFn: async (input) => {
      const res = await client.api['department-shift-types'][':departmentCode'].$put({
        param: { departmentCode },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '部門別シフト種別の更新に失敗しました');
      }
      return departmentShiftTypeListSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...DEPARTMENT_SHIFT_TYPES_QUERY_KEY, departmentCode], data);
    },
  });
}
