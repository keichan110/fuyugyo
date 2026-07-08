import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  assignmentSetResultSchema,
  shiftAgendaResponseSchema,
  shiftEditDataSchema,
  shiftFormDataSchema,
  shiftListSchema,
  shiftViewResponseSchema,
  shiftWithAssignmentsSchema,
  upsertMonthlyAssignmentsResultSchema,
  type AssignmentSetResult,
  type ShiftAgendaDirection,
  type ShiftAgendaResponse,
  type ShiftEditData,
  type ShiftFormData,
  type ShiftListItem,
  type ShiftViewResponse,
  type ShiftWithAssignments,
  type UpsertAssignmentSetInput,
  type UpsertMonthlyAssignmentsInput,
  type UpsertMonthlyAssignmentsResult,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** Shift 関連クエリキー */
export const SHIFTS_QUERY_KEY = ['shifts'] as const;

/** アジェンダ取得パラメータ */
export type ShiftAgendaParams = {
  cursor: string;
  direction: ShiftAgendaDirection;
  limit?: number;
  departmentId?: string;
};

/** edit-data 取得パラメータ */
export type ShiftEditDataParams = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
};

/**
 * シフト一覧を取得する。
 * @param params - `dateFrom`/`dateTo`（YYYY-MM-DD）で期間を、`instructorId` で
 * その Instructor が割り当てられたシフトのみに絞り込める。`limit` は返却件数の
 * 上限（サーバー既定100・上限200）で、無指定の全件取得を避けたいときに指定する
 */
export function useShifts(params?: {
  dateFrom?: string;
  dateTo?: string;
  instructorId?: string;
  limit?: number;
}) {
  return useQuery<ShiftListItem[]>({
    queryKey: [...SHIFTS_QUERY_KEY, 'list', params ?? {}],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.dateFrom) {
        query['dateFrom'] = params.dateFrom;
      }
      if (params?.dateTo) {
        query['dateTo'] = params.dateTo;
      }
      if (params?.instructorId) {
        query['instructorId'] = params.instructorId;
      }
      if (params?.limit) {
        query['limit'] = String(params.limit);
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
 * アジェンダを1ページ取得する。
 * @param params - 起点日・方向・取得する稼働日数・任意の部門 ID
 */
export async function fetchShiftAgendaPage(
  params: ShiftAgendaParams,
): Promise<ShiftAgendaResponse> {
  const query: Record<string, string> = {
    cursor: params.cursor,
    direction: params.direction,
  };
  if (params.limit) {
    query['limit'] = String(params.limit);
  }
  if (params.departmentId) {
    query['departmentId'] = params.departmentId;
  }

  const res = await client.api.shifts.agenda.$get({ query });
  if (!res.ok) {
    const body = apiErrorSchema.parse(await res.json());
    throw new Error(body.message ?? 'アジェンダの取得に失敗しました');
  }
  return shiftAgendaResponseSchema.parse(await res.json());
}

/**
 * 未来方向のアジェンダを続読する Infinite Query。
 * @param cursor - 初回ページの起点日（YYYY-MM-DD）
 * @param departmentId - 任意の部門 ID。指定時はその部門の稼働日だけを取得する
 */
export function useShiftAgendaFuture(cursor: string, departmentId?: string) {
  return useInfiniteQuery<ShiftAgendaResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'agenda', 'future', cursor, departmentId ?? 'all'],
    queryFn: ({ pageParam }) =>
      fetchShiftAgendaPage({
        cursor: typeof pageParam === 'string' ? pageParam : cursor,
        direction: 'future',
        limit: 14,
        ...(departmentId ? { departmentId } : {}),
      }),
    initialPageParam: cursor,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
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
 * (month × 部門) の割り当てを月次まとめて upsert するミューテーション。
 * cells には変更のあったセルのみを含める。
 */
export function useUpsertMonthlyAssignments() {
  const queryClient = useQueryClient();
  return useMutation<UpsertMonthlyAssignmentsResult, Error, UpsertMonthlyAssignmentsInput>({
    mutationFn: async (input) => {
      const res = await client.api.shifts['monthly-assignments'].$put({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '月次割り当ての保存に失敗しました');
      }
      return upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'monthly-view'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'edit-data'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'list'] });
    },
  });
}

/**
 * (date × 部門 × シフト種別) の割り当て集合を upsert するミューテーション。
 * Instructor が 1 件以上なら Shift を暗黙生成/更新し、0 件なら Shift を削除する。
 */
export function useUpsertAssignmentSet() {
  const queryClient = useQueryClient();
  return useMutation<AssignmentSetResult, Error, UpsertAssignmentSetInput>({
    mutationFn: async (input) => {
      const res = await client.api.shifts['assignment-set'].$put({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '割り当ての保存に失敗しました');
      }
      return assignmentSetResultSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'monthly-view'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'edit-data'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'list'] });
    },
  });
}
