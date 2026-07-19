import { describe, expect, it } from 'vitest';

import { SEASON_STATS_QUERY_KEY } from '../src/features/shifts/queries';
import { seasonStatsResponseSchema } from '../src/features/shifts/schema';

describe('SEASON_STATS_QUERY_KEY', () => {
  it('昨季同時点を持たない旧レスポンスのキャッシュキーと分離する', () => {
    expect(SEASON_STATS_QUERY_KEY).not.toEqual(['shifts', 'me', 'season-stats']);
    expect(SEASON_STATS_QUERY_KEY).toEqual(['shifts', 'me', 'season-stats', 'v2']);
  });

  it('昨季同時点を持たない旧APIレスポンスを表示データとして採用しない', () => {
    const legacyResponse = {
      summary: {
        currentMonthWorkDays: 2,
        previousMonthWorkDays: 1,
        currentSeasonWorkDays: 8,
        previousSeasonWorkDays: 10,
        currentSeasonRange: { from: '2025-09-01', to: '2026-08-31' },
        previousSeasonRange: { from: '2024-09-01', to: '2025-08-31' },
      },
      monthlyTrend: [],
      breakdown: [],
    };

    expect(seasonStatsResponseSchema.safeParse(legacyResponse).success).toBe(false);
  });
});
