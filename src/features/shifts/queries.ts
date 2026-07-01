import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  shiftEditDataSchema,
  shiftFormDataSchema,
  shiftListSchema,
  shiftViewResponseSchema,
  shiftWithAssignmentsSchema,
  type CreateShiftInput,
  type ShiftEditData,
  type ShiftFormData,
  type ShiftViewResponse,
  type ShiftWithAssignments,
  type UpdateShiftInput,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** Shift 関連クエリキー */
export const SHIFTS_QUERY_KEY = ['shifts'] as const;

/** edit-data 取得パラメータ */
export type ShiftEditDataParams = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
};

/**
 * シフト一覧を取得する。
 * @param params - `dateFrom`/`dateTo`（YYYY-MM-DD）で期間を絞り込める
 */
export function useShifts(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery<ShiftWithAssignments[]>({
    queryKey: [...SHIFTS_QUERY_KEY, 'list', params ?? {}],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.dateFrom) {
        query['dateFrom'] = params.dateFrom;
      }
      if (params?.dateTo) {
        query['dateTo'] = params.dateTo;
      }

      const res = await client.api.shifts.$get({ query });
      if (!res.ok) {
        throw new Error('シフト一覧の取得に失敗しました');
      }
      return shiftListSchema.parse(await res.json());
    },
  });
}

/**
 * シフトを1件取得する（割り当て済み Instructor ID 付き）。
 * @param id - 対象シフトの ID
 */
export function useShift(id: string) {
  return useQuery<ShiftWithAssignments>({
    queryKey: [...SHIFTS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await client.api.shifts[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('シフトの取得に失敗しました');
      }
      return shiftWithAssignmentsSchema.parse(await res.json());
    },
    enabled: !!id,
  });
}

/**
 * 週次ビューを取得する（開始日から7日間のシフト + 集計）。
 * @param dateFrom - 週の開始日（YYYY-MM-DD）。未指定なら取得を行わない
 */
export function useWeeklyView(dateFrom: string | undefined) {
  return useQuery<ShiftViewResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'weekly-view', dateFrom],
    queryFn: async () => {
      const res = await client.api.shifts['weekly-view'].$get({
        query: { dateFrom: dateFrom ?? '' },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '週次ビューの取得に失敗しました');
      }
      return shiftViewResponseSchema.parse(await res.json());
    },
    enabled: !!dateFrom,
  });
}

/**
 * 月次ビューを取得する（指定月の全シフト + 集計）。
 * @param month - 対象月（YYYY-MM）。未指定なら取得を行わない
 */
export function useMonthlyView(month: string | undefined) {
  return useQuery<ShiftViewResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'monthly-view', month],
    queryFn: async () => {
      const res = await client.api.shifts['monthly-view'].$get({
        query: { month: month ?? '' },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '月次ビューの取得に失敗しました');
      }
      return shiftViewResponseSchema.parse(await res.json());
    },
    enabled: !!month,
  });
}

/**
 * シフト作成フォームの集約データを取得する（部門・シフト種別・統計）。
 */
export function useShiftFormData() {
  return useQuery<ShiftFormData>({
    queryKey: [...SHIFTS_QUERY_KEY, 'form-data'],
    queryFn: async () => {
      const res = await client.api.shifts['form-data'].$get();
      if (!res.ok) {
        throw new Error('シフトフォームデータの取得に失敗しました');
      }
      return shiftFormDataSchema.parse(await res.json());
    },
  });
}

/**
 * シフト編集フォームの集約データを取得する（既存シフト・割り当て候補・競合）。
 * @param params - date / departmentId / shiftTypeId（全て揃ったときのみ取得）
 */
export function useShiftEditData(params: Partial<ShiftEditDataParams>) {
  const enabled = !!(params.date && params.departmentId && params.shiftTypeId);
  return useQuery<ShiftEditData>({
    queryKey: [...SHIFTS_QUERY_KEY, 'edit-data', params],
    queryFn: async () => {
      const res = await client.api.shifts['edit-data'].$get({
        query: {
          date: params.date ?? '',
          departmentId: params.departmentId ?? '',
          shiftTypeId: params.shiftTypeId ?? '',
        },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフト編集データの取得に失敗しました');
      }
      return shiftEditDataSchema.parse(await res.json());
    },
    enabled,
  });
}

/**
 * シフトを作成するミューテーション（本体 + 割り当てを原子的に作成）。
 * 成功後はシフト関連キャッシュを無効化する。
 */
export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation<ShiftWithAssignments, Error, CreateShiftInput>({
    mutationFn: async (input) => {
      const res = await client.api.shifts.$post({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフトの作成に失敗しました');
      }
      return shiftWithAssignmentsSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
    },
  });
}

/**
 * シフトを更新するミューテーション（説明・割り当ての総入れ替え）。
 * 成功後はシフト関連キャッシュを無効化する。
 * @param id - 対象シフトの ID
 */
export function useUpdateShift(id: string) {
  const queryClient = useQueryClient();
  return useMutation<ShiftWithAssignments, Error, UpdateShiftInput>({
    mutationFn: async (input) => {
      const res = await client.api.shifts[':id'].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフトの更新に失敗しました');
      }
      return shiftWithAssignmentsSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
    },
  });
}

/**
 * シフトを削除するミューテーション。
 * 成功後はシフト関連キャッシュを無効化する。
 */
export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await client.api.shifts[':id'].$delete({ param: { id } });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'シフトの削除に失敗しました');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
    },
  });
}
