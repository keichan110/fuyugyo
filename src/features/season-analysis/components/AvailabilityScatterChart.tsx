import { ScatterChart } from '@mantine/charts';
import { Stack, Text } from '@mantine/core';

import type { MemberSummary } from '../aggregators';

type Props = { members: MemberSummary[]; workRatio: number | null };

/**
 * A': 勤務可能日数（x）と勤務日数（y）の散布図。勤務可能日が少ないから配置が少ないのか、
 * 勤務可能なのに配置が少ないのかを見分ける。メンバーごとに1点1系列にしてツールチップに名前を出す。
 */
export function AvailabilityScatterChart({ members, workRatio }: Props) {
  return (
    <Stack gap="xs">
      <Text fw={600}>勤務可能日数と勤務日数</Text>
      <ScatterChart
        h={320}
        data={members.map((member) => ({
          name: member.name,
          color: 'teal.6',
          data: [{ availableDays: member.availableDays, workDays: member.total }],
        }))}
        dataKey={{ x: 'availableDays', y: 'workDays' }}
        xAxisLabel="勤務可能日数（日）"
        yAxisLabel="勤務日数（日）"
        labels={{ x: '勤務可能日数', y: '勤務日数' }}
        valueFormatter={(value) => `${value}日`}
        xAxisProps={{ allowDecimals: false }}
        yAxisProps={{ allowDecimals: false }}
        aria-label="勤務可能日数と勤務日数の散布図"
      />
      <Text size="xs" c="dimmed">
        勤務可能日＝枠のある日のうち「勤務不可」の申告がない日（要調整は含む）。
        {workRatio !== null && ` 全体の勤務率の目安：${Math.round(workRatio * 100)}%`}
      </Text>
    </Stack>
  );
}
