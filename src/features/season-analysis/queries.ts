import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import { seasonAnalysisSchema, type SeasonAnalysis } from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** シーズン分析のクエリキー */
export const SEASON_ANALYSIS_QUERY_KEY = ['season-analysis'] as const;

/**
 * シーズン分析の事実データを取得する。
 * @param season - シーズン開始年（例: 2026 → 2026/9〜2027/8）
 */
export function useSeasonAnalysis(season: number) {
  return useQuery<SeasonAnalysis>({
    queryKey: [...SEASON_ANALYSIS_QUERY_KEY, season],
    queryFn: async () => {
      const res = await client.api['season-analysis'].$get({ query: { season: String(season) } });
      if (!res.ok) {
        const body = apiErrorSchema.safeParse(await res.json());
        throw new Error(
          body.success
            ? (body.data.message ?? 'シーズン分析の取得に失敗しました')
            : 'シーズン分析の取得に失敗しました',
        );
      }
      return seasonAnalysisSchema.parse(await res.json());
    },
  });
}
