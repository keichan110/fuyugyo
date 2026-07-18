import { Card, Text } from '@mantine/core';

import { useMySeasonStats } from '@/features/shifts/queries';

import { SeasonBreakdownCounts } from './SeasonBreakdownCounts';
import { SeasonDepartmentPieChart } from './SeasonDepartmentPieChart';
import { SeasonShiftTypePieChart } from './SeasonShiftTypePieChart';
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
      <SeasonWorkDaysChart monthlyTrend={data.monthlyTrend} />
      <SeasonDepartmentPieChart byDepartment={data.byDepartment} />
      <SeasonShiftTypePieChart byShiftType={data.byShiftType} />
    </>
  );
}
