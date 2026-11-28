import { Paper, SimpleGrid, Text } from '@mantine/core';

import { useMySeasonStats } from '@/features/shifts/queries';

import { DashboardSection } from './DashboardSection';
import { SeasonWorkBreakdownChart } from './SeasonWorkBreakdownChart';
import { SeasonWorkDaysChart } from './SeasonWorkDaysChart';
import { SeasonWorkDaysSummary } from './SeasonWorkDaysSummary';

/**
 * ダッシュボード「今シーズン」セクション（Issue #203）。
 * 勤務日数・勤務内訳・月別推移を、それぞれ白い面に表示する。
 * 勤務日数の月別推移と通算推移は複合グラフに統合して表示する。
 * 呼び出し元（ダッシュボード）が instructorId 確定時のみ描画する前提
 * （未連携ユーザーには表示しない）。
 */
export function SeasonStatsSection() {
  return (
    <DashboardSection title="今シーズン">
      <SeasonStatsContent />
    </DashboardSection>
  );
}

/** 集計の取得状態に応じた内容 */
function SeasonStatsContent() {
  const { data, isLoading, isError } = useMySeasonStats();

  if (isLoading) {
    return (
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed">
          読み込み中…
        </Text>
      </Paper>
    );
  }

  if (isError || !data) {
    return (
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed">
          今シーズンの集計を取得できませんでした。
        </Text>
      </Paper>
    );
  }

  return (
    <>
      <Paper withBorder radius="md" p="md">
        <SeasonWorkDaysSummary summary={data.summary} />
      </Paper>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="md">
          <SeasonWorkBreakdownChart breakdown={data.breakdown} />
        </Paper>
        <Paper withBorder radius="md" p="md">
          <SeasonWorkDaysChart monthlyTrend={data.monthlyTrend} />
        </Paper>
      </SimpleGrid>
    </>
  );
}
