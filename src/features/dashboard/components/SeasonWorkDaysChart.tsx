import { CompositeChart } from '@mantine/charts';
import { Card, Paper, Text, Title } from '@mantine/core';

import type { SeasonMonthlyWorkDays } from '@/features/shifts/schema';

/** 'YYYY-MM' を 'M月' 表示に整形する。 */
function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/**
 * 月別勤務日数と、その月までのシーズン通算勤務日数をグラフ用データに変換する。
 * @param monthlyTrend - シーズン開始月順の月別勤務日数
 */
export function buildSeasonWorkDaysChartData(
  monthlyTrend: SeasonMonthlyWorkDays[],
): { month: string; workDays: number; totalWorkDays: number }[] {
  let totalWorkDays = 0;

  return monthlyTrend.map((item) => {
    totalWorkDays += item.workDays;

    return {
      month: monthLabel(item.month),
      workDays: item.workDays,
      totalWorkDays,
    };
  });
}

/** 月別勤務日数と通算勤務日数をツールチップ用の表示文字列に整形する。 */
export function formatSeasonWorkDaysTooltip(
  month: string,
  workDays: number,
  totalWorkDays: number,
): string {
  return `${month} ${workDays}日 / 通算${totalWorkDays}日`;
}

/**
 * 月別勤務日数（棒）とシーズン通算勤務日数（線）を重ねて表示する複合グラフカード。
 */
export function SeasonWorkDaysChart({ monthlyTrend }: { monthlyTrend: SeasonMonthlyWorkDays[] }) {
  const hasData = monthlyTrend.some((item) => item.workDays > 0);
  const data = buildSeasonWorkDaysChartData(monthlyTrend);

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        月別・シーズン通算勤務日数
      </Title>
      {hasData ? (
        <CompositeChart
          h={260}
          data={data}
          dataKey="month"
          series={[
            { name: 'workDays', type: 'bar', color: 'blue.6', label: '月別勤務日数' },
            {
              name: 'totalWorkDays',
              type: 'line',
              color: 'orange.6',
              label: 'シーズン通算勤務日数',
              yAxisId: 'right',
            },
          ]}
          withLegend
          withRightYAxis
          yAxisLabel="月別"
          rightYAxisLabel="通算"
          yAxisProps={{ allowDecimals: false }}
          rightYAxisProps={{ allowDecimals: false }}
          valueFormatter={(value) => `${value}日`}
          tooltipProps={{
            content: ({ active, label, payload }) => {
              const workDays = payload?.find((item) => item.dataKey === 'workDays')?.value;
              const totalWorkDays = payload?.find(
                (item) => item.dataKey === 'totalWorkDays',
              )?.value;

              if (
                !active ||
                typeof label !== 'string' ||
                typeof workDays !== 'number' ||
                typeof totalWorkDays !== 'number'
              ) {
                return null;
              }

              return (
                <Paper withBorder shadow="sm" p="xs">
                  <Text size="sm">
                    {formatSeasonWorkDaysTooltip(label, workDays, totalWorkDays)}
                  </Text>
                </Paper>
              );
            },
          }}
        />
      ) : (
        <Text size="sm" c="dimmed">
          今シーズンの勤務実績はまだありません。
        </Text>
      )}
    </Card>
  );
}
