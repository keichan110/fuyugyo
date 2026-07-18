import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  autoAssignContextSchema,
  seasonStatsResponseSchema,
  shiftAgendaResponseSchema,
  shiftAttendanceSchema,
  shiftEditDataSchema,
  shiftFormDataSchema,
  shiftListSchema,
  shiftViewResponseSchema,
  upsertMonthlyAssignmentsResultSchema,
  type AutoAssignContext,
  type SeasonStatsResponse,
  type ShiftAgendaDirection,
  type ShiftAgendaResponse,
  type ShiftAttendance,
  type ShiftEditData,
  type ShiftFormData,
  type ShiftListItem,
  type ShiftViewResponse,
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
  departmentCode?: string;
};

/** assignment-editor 取得パラメータ */
export type ShiftEditDataParams = {
  date: string;
  departmentCode: string;
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
 * 月次カレンダーを取得する（指定月の全シフト + 集計）。
 * @param month - 対象月（YYYY-MM）。未指定なら取得を行わない
 */
export function useShiftCalendar(month: string | undefined) {
  return useQuery<ShiftViewResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'calendar', month],
    queryFn: async () => {
      const res = await client.api.shifts.calendar.$get({
        query: { month: month ?? '' },
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '月次カレンダーの取得に失敗しました');
      }
      return shiftViewResponseSchema.parse(await res.json());
    },
    enabled: !!month,
  });
}

/**
 * 指定日群の出勤状況（各シフトの部門・種別・割り当て済み表示名）を取得する。
 * ダッシュボードの「現在（本日・明日）」「直近（同僚一覧）」で共有する。
 * @param dates - 取得対象日（YYYY-MM-DD）の配列（1〜7件）。空配列なら取得しない
 * @param departmentCode - 任意の部門コード。指定時はその部門のみに絞る
 */
export function useShiftAttendance(dates: string[], departmentCode?: string) {
  return useQuery<ShiftAttendance>({
    queryKey: [...SHIFTS_QUERY_KEY, 'attendance', dates, departmentCode ?? 'all'],
    queryFn: async () => {
      const query: Record<string, string> = { dates: dates.join(',') };
      if (departmentCode) {
        query['departmentCode'] = departmentCode;
      }
      const res = await client.api.shifts.attendance.$get({ query });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '出勤状況の取得に失敗しました');
      }
      return shiftAttendanceSchema.parse(await res.json());
    },
    enabled: dates.length > 0,
  });
}

/**
 * アジェンダを1ページ取得する。
 * @param params - 起点日・方向・取得する稼働日数・任意の部門コード
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
  if (params.departmentCode) {
    query['departmentCode'] = params.departmentCode;
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
 * @param departmentCode - 任意の部門コード。指定時はその部門の稼働日だけを取得する
 */
export function useShiftAgendaFuture(cursor: string, departmentCode?: string) {
  return useInfiniteQuery<ShiftAgendaResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'agenda', 'future', cursor, departmentCode ?? 'all'],
    queryFn: ({ pageParam }) =>
      fetchShiftAgendaPage({
        cursor: typeof pageParam === 'string' ? pageParam : cursor,
        direction: 'future',
        limit: 14,
        ...(departmentCode ? { departmentCode } : {}),
      }),
    initialPageParam: cursor,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
  });
}

/**
 * シフト作成フォームの集約データを取得する（選択部門のシフト種別・統計）。
 * @param departmentCode - 選択中の部門コード
 */
export function useShiftCreationContext(departmentCode: string) {
  return useQuery<ShiftFormData>({
    queryKey: [...SHIFTS_QUERY_KEY, 'creation-context', departmentCode],
    queryFn: async () => {
      const res = await client.api.shifts['creation-context'].$get({
        query: { departmentCode },
      });
      if (!res.ok) {
        throw new Error('シフト作成データの取得に失敗しました');
      }
      return shiftFormDataSchema.parse(await res.json());
    },
    enabled: !!departmentCode,
  });
}

/**
 * 自動割当の候補・可用性・既存割当を対象月単位で取得する。
 * @param departmentCode - 対象部門
 * @param month - 対象月（YYYY-MM）
 */
export function useAutoAssignContext(departmentCode: string, month: string) {
  const from = `${month}-01`;
  const to = new Date(`${from}T00:00:00.000Z`);
  to.setUTCMonth(to.getUTCMonth() + 1);
  to.setUTCDate(0);
  const end = to.toISOString().slice(0, 10);

  return useQuery<AutoAssignContext>({
    queryKey: [...SHIFTS_QUERY_KEY, 'auto-assign-context', departmentCode, month],
    queryFn: async () => {
      const res = await client.api.shifts['auto-assign-context'].$get({
        query: { departmentCode, from, to: end },
      });
      if (!res.ok) {
        const body = apiErrorSchema.safeParse(await res.json());
        throw new Error(
          body.success
            ? (body.data.message ?? '自動割当データの取得に失敗しました')
            : '自動割当データの取得に失敗しました',
        );
      }
      return autoAssignContextSchema.parse(await res.json());
    },
    enabled: !!departmentCode && !!month,
  });
}

/**
 * シフト編集フォームの集約データを取得する（既存シフト・割り当て候補・競合）。
 * @param params - date / departmentCode / shiftTypeId（全て揃ったときのみ取得）
 */
export function useShiftAssignmentEditor(params: Partial<ShiftEditDataParams>) {
  const enabled = !!(params.date && params.departmentCode && params.shiftTypeId);
  return useQuery<ShiftEditData>({
    queryKey: [...SHIFTS_QUERY_KEY, 'assignment-editor', params],
    queryFn: async () => {
      const res = await client.api.shifts['assignment-editor'].$get({
        query: {
          date: params.date ?? '',
          departmentCode: params.departmentCode ?? '',
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
 * ダッシュボード「今シーズン」セクション向けの集計を取得する（Issue #203）。
 * ログイン User が Instructor 未連携の場合はサーバーが 404 を返す前提のため、
 * 呼び出し元（ダッシュボード）は instructorId が確定しているときだけ描画すること。
 */
export function useMySeasonStats() {
  return useQuery<SeasonStatsResponse>({
    queryKey: [...SHIFTS_QUERY_KEY, 'me', 'season-stats'],
    queryFn: async () => {
      const res = await client.api.shifts.me['season-stats'].$get();
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '今シーズンの集計取得に失敗しました');
      }
      return seasonStatsResponseSchema.parse(await res.json());
    },
  });
}

/**
 * (month × 部門) の割り当てを月次まとめて upsert するミューテーション。
 * cells には変更のあったセルのみを含める。
 */
export function useUpsertAssignments() {
  const queryClient = useQueryClient();
  return useMutation<UpsertMonthlyAssignmentsResult, Error, UpsertMonthlyAssignmentsInput>({
    mutationFn: async (input) => {
      const res = await client.api.shifts.assignments.$put({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '月次割り当ての保存に失敗しました');
      }
      return upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'calendar'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'assignment-editor'] });
      void queryClient.invalidateQueries({ queryKey: [...SHIFTS_QUERY_KEY, 'list'] });
    },
  });
}
