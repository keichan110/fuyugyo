import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { DepartmentCode } from '@/features/departments/schema';
import { client } from '@/lib/rpc';

import {
  departmentShiftTypeCertificationListSchema,
  type DepartmentShiftTypeCertification,
  type DepartmentShiftTypeCertificationUpdateInput,
} from './schema';

/** 部門別シフト種別資格序列のクエリキー。 */
export const DEPARTMENT_SHIFT_TYPE_CERTIFICATIONS_QUERY_KEY = [
  'department-shift-type-certifications',
] as const;

const apiErrorSchema = z.object({ message: z.string().optional() });

/** 指定した部門・シフト種別枠の資格序列を取得する。 */
export function useDepartmentShiftTypeCertifications(
  departmentCode: DepartmentCode,
  shiftTypeId: string | null,
) {
  return useQuery<DepartmentShiftTypeCertification[]>({
    queryKey: [...DEPARTMENT_SHIFT_TYPE_CERTIFICATIONS_QUERY_KEY, departmentCode, shiftTypeId],
    enabled: shiftTypeId !== null,
    queryFn: async () => {
      if (!shiftTypeId) throw new Error('シフト種別が選択されていません');
      const res = await client.api['department-shift-type-certifications'][':departmentCode'][
        ':shiftTypeId'
      ].$get({ param: { departmentCode, shiftTypeId } });
      if (!res.ok) throw new Error('必要資格の取得に失敗しました');
      return departmentShiftTypeCertificationListSchema.parse(await res.json());
    },
  });
}

/** 指定した部門・シフト種別枠の資格序列を全置換する。 */
export function useUpdateDepartmentShiftTypeCertifications(
  departmentCode: DepartmentCode,
  shiftTypeId: string,
) {
  const queryClient = useQueryClient();

  return useMutation<
    DepartmentShiftTypeCertification[],
    Error,
    DepartmentShiftTypeCertificationUpdateInput
  >({
    mutationFn: async (input) => {
      const res = await client.api['department-shift-type-certifications'][':departmentCode'][
        ':shiftTypeId'
      ].$put({ param: { departmentCode, shiftTypeId }, json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '必要資格の保存に失敗しました');
      }
      return departmentShiftTypeCertificationListSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        [...DEPARTMENT_SHIFT_TYPE_CERTIFICATIONS_QUERY_KEY, departmentCode, shiftTypeId],
        data,
      );
    },
  });
}
