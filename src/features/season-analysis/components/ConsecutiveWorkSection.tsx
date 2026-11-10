import { BarChart } from '@mantine/charts';
import { Badge, Group, Stack, Table, Text } from '@mantine/core';

import { CONSECUTIVE_WORK_LIMIT, type ConsecutiveView } from '../consecutive';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** C: 連勤。メンバー別の最大連勤と、4連勤以上の期間一覧を示す。 */
export function ConsecutiveWorkSection({
  view,
  expanded,
}: {
  view: ConsecutiveView;
  expanded: boolean;
}) {
  return (
    <Stack gap="md">
      <Stack gap="xs">
        {view.members.length === 0 ? (
          <Text size="sm" c="dimmed">
            勤務がありません。
          </Text>
        ) : (
          <BarChart
            h={Math.max(expanded ? 320 : PANEL_CHART_HEIGHT, view.members.length * 28 + 60)}
            data={view.members.map((member) => ({
              name: member.name,
              maxStreak: member.maxStreak,
            }))}
            dataKey="name"
            orientation="vertical"
            series={[{ name: 'maxStreak', color: 'orange.6', label: '最大連勤日数' }]}
            xAxisProps={{ allowDecimals: false }}
            yAxisProps={{ width: 96 }}
            referenceLines={[
              {
                x: CONSECUTIVE_WORK_LIMIT,
                color: 'red.6',
                strokeDasharray: '5 5',
                label: { value: `${CONSECUTIVE_WORK_LIMIT}連勤`, position: 'top' },
              },
            ]}
            valueFormatter={(value) => `${value}日`}
            aria-label="メンバー別の最大連勤日数"
          />
        )}
      </Stack>
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {CONSECUTIVE_WORK_LIMIT}連勤以上の期間
        </Text>
        {view.longRuns.length === 0 ? (
          <Text size="sm" c="dimmed">
            {CONSECUTIVE_WORK_LIMIT}連勤以上はありません
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={420}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>メンバー</Table.Th>
                  <Table.Th>期間</Table.Th>
                  <Table.Th>日数</Table.Th>
                  <Table.Th>区分</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {view.longRuns.map((run) => (
                  <Table.Tr key={`${run.instructorId}:${run.from}`}>
                    <Table.Td>{run.name}</Table.Td>
                    <Table.Td>
                      {formatDay(run.from)}〜{formatDay(run.to)}
                    </Table.Td>
                    <Table.Td>{run.days}日</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {run.includesPast && (
                          <Badge variant="light" color="teal">
                            実施済み
                          </Badge>
                        )}
                        {run.includesFuture && (
                          <Badge variant="light" color="gray">
                            予定
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Stack>
  );
}
