import { Card, Text } from '@mantine/core';

import { useMySeasonStats } from '@/features/shifts/queries';

import { SeasonBreakdownCounts } from './SeasonBreakdownCounts';
import { SeasonCumulativeTrendChart } from './SeasonCumulativeTrendChart';
import { SeasonDepartmentPieChart } from './SeasonDepartmentPieChart';
import { SeasonMonthlyTrendChart } from './SeasonMonthlyTrendChart';
import { SeasonShiftTypePieChart } from './SeasonShiftTypePieChart';
import { SeasonWorkDaysSummary } from './SeasonWorkDaysSummary';

/**
 * ダッシュボード「今シーズン」セクション（Issue #203）。
 * 採用アイデア6項目を仮実装として個別カードで並べる。統合（3カード案への集約）は
 * 実データを見てから判断するため、ここでは踏み込まない。
 * 呼び出し元（ダッシュボード）が instructorId 確定時のみ描画する前提
 * （未連携ユーザーには表示しない）。
 */
export function SeasonStatsSection() {
  const { data, isLoading, isError } = useMySeasonStats();

  if (isLoading) {
    return (
      <Card padding="lg">
        <Text size="sm" c="dimmed">
          読み込み中…
        </Text>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card padding="lg">
        <Text size="sm" c="dimmed">
          今シーズンの集計を取得できませんでした。
        </Text>
      </Card>
    );
  }

  return (
    <>
      <SeasonWorkDaysSummary summary={data.summary} />
      <SeasonBreakdownCounts byDepartment={data.byDepartment} byShiftType={data.byShiftType} />
      <SeasonMonthlyTrendChart monthlyTrend={data.monthlyTrend} />
      <SeasonCumulativeTrendChart monthlyTrend={data.monthlyTrend} />
      <SeasonDepartmentPieChart byDepartment={data.byDepartment} />
      <SeasonShiftTypePieChart byShiftType={data.byShiftType} />
    </>
  );
}
