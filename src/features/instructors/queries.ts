import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  activeInstructorInDepartmentListSchema,
  instructorCertificationSchema,
  instructorListSchema,
  instructorSchema,
  instructorWithCertificationsSchema,
  type ActiveInstructorInDepartment,
  type AssignCertificationInput,
  type ChangeInstructorStatusInput,
  type CreateInstructorInput,
  type Instructor,
  type InstructorCertification,
  type InstructorWithCertifications,
  type UpdateInstructorInput,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** Instructor 関連クエリキー */
export const INSTRUCTORS_QUERY_KEY = ['instructors'] as const;

/**
 * インストラクター一覧を取得する。
 * @param status - 指定するとそのステータスのみ返す（省略時は ACTIVE のみ）
 */
export function useInstructors(status?: string) {
  return useQuery<Instructor[]>({
    queryKey: [...INSTRUCTORS_QUERY_KEY, { status }],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (status) query['status'] = status;

      const res = await client.api.instructors.$get({ query });
      if (!res.ok) {
        throw new Error('インストラクター一覧の取得に失敗しました');
      }
      return instructorListSchema.parse(await res.json());
    },
  });
}

/**
 * インストラクターを1件取得する（Certification 一覧付き）。
 * @param id - 対象インストラクターの ID
 */
export function useInstructor(id: string) {
  return useQuery<InstructorWithCertifications>({
    queryKey: [...INSTRUCTORS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await client.api.instructors[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('インストラクターの取得に失敗しました');
      }
      return instructorWithCertificationsSchema.parse(await res.json());
    },
    enabled: !!id,
  });
}

/**
 * 部門別アクティブ Instructor 一覧を取得する（N+1 なし）。
 * @param departmentId - 対象部門の ID
 */
export function useActiveInstructorsByDepartment(departmentId: string) {
  return useQuery<ActiveInstructorInDepartment[]>({
    queryKey: [...INSTRUCTORS_QUERY_KEY, 'by-department', departmentId, 'active'],
    queryFn: async () => {
      const res = await client.api.instructors['by-department'][':departmentId'].active.$get({
        param: { departmentId },
      });
      if (!res.ok) {
        throw new Error('部門別インストラクターの取得に失敗しました');
      }
      return activeInstructorInDepartmentListSchema.parse(await res.json());
    },
    enabled: !!departmentId,
  });
}

/**
 * インストラクターを作成するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useCreateInstructor() {
  const queryClient = useQueryClient();
  return useMutation<Instructor, Error, CreateInstructorInput>({
    mutationFn: async (input) => {
      const res = await client.api.instructors.$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターの作成に失敗しました');
      }
      return instructorSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSTRUCTORS_QUERY_KEY });
    },
  });
}

/**
 * インストラクター情報を更新するミューテーション。
 * 成功後は該当インストラクターと一覧キャッシュを無効化する。
 */
export function useUpdateInstructor(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Instructor, Error, UpdateInstructorInput>({
    mutationFn: async (input) => {
      const res = await client.api.instructors[':id'].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターの更新に失敗しました');
      }
      return instructorSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSTRUCTORS_QUERY_KEY });
    },
  });
}

/**
 * インストラクターのステータスを変更するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useChangeInstructorStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Instructor, Error, ChangeInstructorStatusInput>({
    mutationFn: async (input) => {
      const res = await client.api.instructors[':id']['change-status'].$post({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'ステータスの変更に失敗しました');
      }
      return instructorSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSTRUCTORS_QUERY_KEY });
    },
  });
}

/**
 * Certification を割り当てるミューテーション。
 * 成功後は該当インストラクターのキャッシュを無効化する。
 */
export function useAssignCertification(instructorId: string) {
  const queryClient = useQueryClient();
  return useMutation<InstructorCertification, Error, AssignCertificationInput>({
    mutationFn: async (input) => {
      const res = await client.api.instructors[':id'].certifications.$post({
        param: { id: instructorId },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '資格の割り当てに失敗しました');
      }
      return instructorCertificationSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSTRUCTORS_QUERY_KEY });
    },
  });
}

/**
 * Certification を解除するミューテーション。
 * 成功後は該当インストラクターのキャッシュを無効化する。
 */
export function useUnassignCertification(instructorId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (certificationId) => {
      const res = await client.api.instructors[':id'].certifications[':certId'].$delete({
        param: { id: instructorId, certId: certificationId },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '資格の解除に失敗しました');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSTRUCTORS_QUERY_KEY });
    },
  });
}
