import { ScatterChart } from '@mantine/charts';

import type { MemberSummary } from '../aggregators';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

type Props = { members: MemberSummary[]; expanded: boolean };

/**
 * A': 勤務可能日数（x）と勤務日数（y）の散布図。勤務可能日が少ないから配置が少ないのか、
 * 勤務可能なのに配置が少ないのかを見分ける。メンバーごとに1点1系列にしてツールチップに名前を出す。
 */
export function AvailabilityScatterChart({ members, expanded }: Props) {
  return (
    <ScatterChart
      h={expanded ? 480 : PANEL_CHART_HEIGHT}
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
  );
}
