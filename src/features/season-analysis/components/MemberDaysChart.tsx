import { BarChart } from '@mantine/charts';
import { Paper, Stack, Text } from '@mantine/core';

import { DEPARTMENT_LABELS, departmentCodeSchema } from '@/features/departments/schema';

import type { MemberSummary } from '../aggregators';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

type Props = {
  members: MemberSummary[];
  averageDays: number;
  expanded: boolean;
  /** 部門を絞り込んでいるとき、他部門の勤務日数を灰色で積み上げる */
  showOtherDepartment: boolean;
};

/** 同名メンバーが混ざっても軸ラベルが衝突しないよう、重複には連番を付ける */
function uniqueLabels(members: MemberSummary[]): string[] {
  const seen = new Map<string, number>();
  return members.map((member) => {
    const count = (seen.get(member.name) ?? 0) + 1;
    seen.set(member.name, count);
    return count === 1 ? member.name : `${member.name}(${count})`;
  });
}

/** A: メンバー別の勤務日数（実施済み・予定の積み上げ横棒）。ツールチップに部門別内訳を出す。 */
export function MemberDaysChart({ members, averageDays, expanded, showOtherDepartment }: Props) {
  const labels = uniqueLabels(members);
  const data = members.map((member, index) => ({
    name: labels[index] ?? member.name,
    past: member.past,
    future: member.future,
    other: member.otherDepartmentDays,
  }));
  const memberByLabel = new Map(members.map((member, index) => [labels[index], member]));
  return (
    <Stack gap="xs">
      <BarChart
        h={Math.max(expanded ? 320 : PANEL_CHART_HEIGHT, members.length * 28 + 60)}
        data={data}
        dataKey="name"
        orientation="vertical"
        type="stacked"
        series={[
          { name: 'past', color: 'teal.6', label: '実施済み' },
          { name: 'future', color: 'teal.2', label: '予定' },
          ...(showOtherDepartment ? [{ name: 'other', color: 'gray.4', label: '他部門' }] : []),
        ]}
        withLegend
        xAxisProps={{ allowDecimals: false }}
        yAxisProps={{ width: 96 }}
        referenceLines={[
          {
            x: averageDays,
            color: 'indigo.6',
            strokeDasharray: '5 5',
            label: { value: `平均 ${averageDays.toFixed(1)}日`, position: 'top' },
          },
        ]}
        valueFormatter={(value) => `${value}日`}
        tooltipProps={{
          content: ({ label }) => {
            const member = memberByLabel.get(String(label));
            if (!member) return null;
            return (
              <Paper withBorder shadow="sm" p="xs">
                <Text size="sm" fw={600}>
                  {member.name}：{member.total}日
                </Text>
                <Text size="xs">
                  実施済み {member.past}日 ／ 予定 {member.future}日
                </Text>
                {showOtherDepartment && (
                  <Text size="xs">
                    他部門 {member.otherDepartmentDays}日 ／ 全部門合計{' '}
                    {member.total + member.otherDepartmentDays}日
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  部門別（日数）：
                  {departmentCodeSchema.options
                    .map((code) => `${DEPARTMENT_LABELS[code]} ${member.departmentDays[code]}日`)
                    .join(' ／ ')}
                </Text>
              </Paper>
            );
          },
        }}
        aria-label="メンバー別の勤務日数。実施済みと予定の積み上げ"
      />
    </Stack>
  );
}
