import { LineChart } from '@mantine/charts';
import { Card, Text, Title } from '@mantine/core';

import type { SeasonMonthlyWorkDays } from '@/features/shifts/schema';

/** 'YYYY-MM' を 'M月' 表示に整形する（推移グラフの横軸ラベル用） */
function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/**
 * 月別勤務日数を先頭から累積した通算勤務日数の配列を返す。
 * @param monthlyTrend - シーズン開始月順の月別勤務日数
 */
function toCumulative(monthlyTrend: SeasonMonthlyWorkDays[]): { month: string; total: number }[] {
  let runningTotal = 0;
  return monthlyTrend.map((item) => {
    runningTotal += item.workDays;
    return { month: monthLabel(item.month), total: runningTotal };
  });
}

/**
 * シーズン通算の勤務日数トレンドラインカード。
 * 月別推移（`SeasonMonthlyTrendChart`）と同一データ（月別勤務日数）の粒度違いのため、
 * レスポンスの `monthlyTrend` をクライアント側で累積して描画する。
 * Issue #203 採用アイデア「シーズン通算の勤務日数トレンドライン」。
 */
export function SeasonCumulativeTrendChart({
  monthlyTrend,
}: {
  monthlyTrend: SeasonMonthlyWorkDays[];
}) {
  const hasData = monthlyTrend.some((item) => item.workDays > 0);
  const data = toCumulative(monthlyTrend);

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        シーズン通算の勤務日数
      </Title>
      {hasData ? (
        <LineChart
          h={220}
          data={data}
          dataKey="month"
          series={[{ name: 'total', color: 'teal.6', label: '通算勤務日数' }]}
          withLegend={false}
          valueFormatter={(value) => `${value}日`}
        />
      ) : (
        <Text size="sm" c="dimmed">
          今シーズンの勤務実績はまだありません。
        </Text>
      )}
    </Card>
  );
}
