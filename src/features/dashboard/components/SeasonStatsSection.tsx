import { SimpleGrid, Stack, Text } from '@mantine/core';

import { useMySeasonStats } from '@/features/shifts/queries';

import { SeasonWorkBreakdownChart } from './SeasonWorkBreakdownChart';
import { SeasonWorkDaysChart } from './SeasonWorkDaysChart';
import { SeasonWorkDaysSummary } from './SeasonWorkDaysSummary';

/**
 * ダッシュボード「今シーズン」セクション（Issue #203）。
 * 勤務日数の月別推移と通算推移は複合グラフに統合して表示する。
 * 呼び出し元（ダッシュボード）が instructorId 確定時のみ描画する前提
 * （未連携ユーザーには表示しない）。
 */
export function SeasonStatsSection() {
  const { data, isLoading, isError } = useMySeasonStats();

  if (isLoading) {
    return (
      <Stack>
        <Text size="sm" c="dimmed">
          読み込み中…
        </Text>
      </Stack>
    );
  }

  if (isError || !data) {
    return (
      <Stack>
        <Text size="sm" c="dimmed">
          今シーズンの集計を取得できませんでした。
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <SeasonWorkDaysSummary summary={data.summary} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
        <SeasonWorkBreakdownChart breakdown={data.breakdown} />
        <SeasonWorkDaysChart monthlyTrend={data.monthlyTrend} />
      </SimpleGrid>
    </Stack>
  );
}
