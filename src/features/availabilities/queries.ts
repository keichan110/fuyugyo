import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import {
  availabilityListResponseSchema,
  availabilityListSchema,
  type Availability,
  type UpdateMyAvailabilitiesInput,
} from './schema';

const apiErrorSchema = z.object({ message: z.string().optional() });

/** 本人の可用性申告クエリキー。月単位でキャッシュする。 */
export const MY_AVAILABILITIES_QUERY_KEY = ['availabilities', 'me'] as const;
/** 管理者向け可用性一覧クエリキー。 */
export const AVAILABILITIES_QUERY_KEY = ['availabilities'] as const;

/** 指定期間の全インストラクターの可用性を取得する（MANAGER 以上）。 */
export function useAvailabilities(from: string, to: string) {
  return useQuery<Availability[]>({
    queryKey: [...AVAILABILITIES_QUERY_KEY, from, to],
    queryFn: async () => {
      const res = await client.api.availabilities.$get({ query: { from, to } });
      if (!res.ok) {
        const body = apiErrorSchema.safeParse(await res.json());
        throw new Error(
          body.success
            ? (body.data.message ?? '勤務可否の取得に失敗しました')
            : '勤務可否の取得に失敗しました',
        );
      }
      return availabilityListSchema.parse(await res.json());
    },
    enabled: !!from && !!to,
  });
}

/** 指定月の本人申告と編集不能な割当日を取得する。 */
export function useMyAvailabilities(month: string) {
  const from = `${month}-01`;
  const nextMonth = new Date(`${from}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  const to = nextMonth.toISOString().slice(0, 10);

  return useQuery({
    queryKey: [...MY_AVAILABILITIES_QUERY_KEY, month],
    queryFn: async () => {
      const res = await client.api.availabilities.me.$get({ query: { from, to } });
      if (!res.ok) {
        const body = apiErrorSchema.safeParse(await res.json());
        throw new Error(
          body.success
            ? (body.data.message ?? '勤務可否の取得に失敗しました')
            : '勤務可否の取得に失敗しました',
        );
      }
      return availabilityListResponseSchema.parse(await res.json());
    },
  });
}

/** 本人の月内ステージ済み差分を保存する。 */
export function useUpdateMyAvailabilities() {
  const queryClient = useQueryClient();
  return useMutation<{ updatedCount: number }, Error, UpdateMyAvailabilitiesInput>({
    mutationFn: async (input) => {
      const res = await client.api.availabilities.me.$put({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.safeParse(await res.json());
        throw new Error(
          body.success
            ? (body.data.message ?? '勤務可否の保存に失敗しました')
            : '勤務可否の保存に失敗しました',
        );
      }
      return z.object({ updatedCount: z.number() }).parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_AVAILABILITIES_QUERY_KEY });
    },
  });
}
