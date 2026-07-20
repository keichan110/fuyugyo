import { CompositeChart } from '@mantine/charts';
import { Paper, Stack, Text, Title } from '@mantine/core';

import type { SeasonMonthlyWorkDays } from '@/features/shifts/schema';

import {
  buildSeasonWorkDaysChartData,
  formatSeasonWorkDaysTooltip,
} from './season-work-days-chart-data';

/**
 * 月別勤務日数（棒）とシーズン通算勤務日数（線）を重ねて表示する複合グラフカード。
 */
export function SeasonWorkDaysChart({ monthlyTrend }: { monthlyTrend: SeasonMonthlyWorkDays[] }) {
  const hasData = monthlyTrend.some((item) => item.workDays > 0);
  const data = buildSeasonWorkDaysChartData(monthlyTrend);

  return (
    <Stack gap="md">
      <Title order={3} size="h4">
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
    </Stack>
  );
}
