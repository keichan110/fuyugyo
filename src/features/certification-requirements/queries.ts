import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { DepartmentCode } from '@/features/departments/schema';
import { MASTER_DATA_STALE_TIME } from '@/lib/query-client';
import { client } from '@/lib/rpc';

import {
  certificationRequirementListSchema,
  type CertificationRequirement,
  type CertificationRequirementUpdateInput,
} from './schema';

/** 必要資格のクエリキー。 */
export const CERTIFICATION_REQUIREMENTS_QUERY_KEY = ['certification-requirements'] as const;

const apiErrorSchema = z.object({ message: z.string().optional() });

/** 指定した部門・シフト種別枠の必要資格を取得する。 */
export function useCertificationRequirements(
  departmentCode: DepartmentCode,
  shiftTypeId: string | null,
) {
  return useQuery<CertificationRequirement[]>({
    queryKey: [...CERTIFICATION_REQUIREMENTS_QUERY_KEY, departmentCode, shiftTypeId],
    enabled: shiftTypeId !== null,
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async () => {
      if (!shiftTypeId) throw new Error('シフト種別が選択されていません');
      const res = await client.api['certification-requirements'][':departmentCode'][
        ':shiftTypeId'
      ].$get({ param: { departmentCode, shiftTypeId } });
      if (!res.ok) throw new Error('必要資格の取得に失敗しました');
      return certificationRequirementListSchema.parse(await res.json());
    },
  });
}

/** 指定した部門・シフト種別枠の必要資格を全置換する。 */
export function useUpdateCertificationRequirements(
  departmentCode: DepartmentCode,
  shiftTypeId: string,
) {
  const queryClient = useQueryClient();

  return useMutation<CertificationRequirement[], Error, CertificationRequirementUpdateInput>({
    mutationFn: async (input) => {
      const res = await client.api['certification-requirements'][':departmentCode'][
        ':shiftTypeId'
      ].$put({ param: { departmentCode, shiftTypeId }, json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '必要資格の保存に失敗しました');
      }
      return certificationRequirementListSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        [...CERTIFICATION_REQUIREMENTS_QUERY_KEY, departmentCode, shiftTypeId],
        data,
      );
    },
  });
}
