import { BarChart } from '@mantine/charts';
import { Card, Text, Title } from '@mantine/core';

import type { SeasonMonthlyWorkDays } from '@/features/shifts/schema';

/** 'YYYY-MM' を 'M月' 表示に整形する（推移グラフの横軸ラベル用） */
function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/**
 * 月別勤務日数の推移グラフカード（今シーズン）。
 * Issue #203 採用アイデア「月別勤務日数の推移グラフ」。
 */
export function SeasonMonthlyTrendChart({
  monthlyTrend,
}: {
  monthlyTrend: SeasonMonthlyWorkDays[];
}) {
  const hasData = monthlyTrend.some((item) => item.workDays > 0);
  const data = monthlyTrend.map((item) => ({
    month: monthLabel(item.month),
    workDays: item.workDays,
  }));

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        月別勤務日数の推移
      </Title>
      {hasData ? (
        <BarChart
          h={220}
          data={data}
          dataKey="month"
          series={[{ name: 'workDays', color: 'blue.6', label: '勤務日数' }]}
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
