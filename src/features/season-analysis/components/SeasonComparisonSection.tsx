import { BarChart } from '@mantine/charts';
import { Badge, Group, Stack, Text } from '@mantine/core';

import type { ComparisonView } from '../comparison';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** F: 前シーズンとの比較。月別の延べ勤務日数とメンバー別の増減を示す。 */
export function SeasonComparisonSection({
  view,
  season,
  isLoading,
  expanded,
}: {
  view: ComparisonView | null;
  season: number;
  isLoading: boolean;
  expanded: boolean;
}) {
  if (!view) {
    return (
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {isLoading ? '前シーズンのデータを読み込んでいます。' : '前シーズンのデータがありません'}
        </Text>
      </Stack>
    );
  }
  const { period } = view;
  const periodLabel =
    period.mode === 'toDate'
      ? `${formatDay(period.current.from)}〜${formatDay(period.current.to)} 時点で比較`
      : 'シーズン全期間で比較';
  const previousLabel = `${season - 1}シーズン`;
  const currentLabel = `${season}シーズン`;
  return (
    <Stack gap="md">
      <Text size="sm">メンバー別の増減は{periodLabel}（実施済みのみ）</Text>
      {view.previousIsEmpty ? (
        <Text size="sm" c="dimmed">
          前シーズンのデータがありません
        </Text>
      ) : (
        <>
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              月別の延べ勤務日数
            </Text>
            <BarChart
              h={expanded ? 400 : PANEL_CHART_HEIGHT}
              data={view.months.map((month) => ({
                month: `${month.month}月`,
                current: month.current,
                previous: month.previous,
                currentPlanned: month.currentPlanned,
              }))}
              dataKey="month"
              series={[
                { name: 'current', color: 'teal.6', label: currentLabel },
                { name: 'currentPlanned', color: 'teal.2', label: `${currentLabel}（予定）` },
                { name: 'previous', color: 'gray.5', label: previousLabel },
              ]}
              withLegend
              yAxisProps={{ allowDecimals: false }}
              valueFormatter={(value) => `${value}日`}
              aria-label="月別の延べ勤務日数。選択シーズンと前シーズンの比較"
            />
            <Text size="xs" c="dimmed">
              前シーズンは全期間を表示します。今シーズンの今後の月は予定と見比べてください。
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              メンバー別の増減（{currentLabel} − {previousLabel}）
            </Text>
            <BarChart
              h={Math.max(expanded ? 320 : PANEL_CHART_HEIGHT, view.members.length * 28 + 60)}
              data={view.members.map((member) => ({
                name: member.isNew ? `${member.name}（新規）` : member.name,
                increase: Math.max(0, member.diff),
                decrease: Math.min(0, member.diff),
              }))}
              dataKey="name"
              orientation="vertical"
              type="stacked"
              series={[
                { name: 'increase', color: 'blue.6', label: '増' },
                { name: 'decrease', color: 'red.6', label: '減' },
              ]}
              xAxisProps={{ allowDecimals: false }}
              yAxisProps={{ width: 120 }}
              valueFormatter={(value) => `${value > 0 ? '+' : ''}${value}日`}
              aria-label="メンバー別の勤務日数の増減"
            />
            <Group gap="xs">
              <Badge variant="light">新規</Badge>
              <Text size="xs" c="dimmed">
                前シーズンに配置がない人。今シーズンに配置がない人は減少として表示します。
              </Text>
            </Group>
          </Stack>
        </>
      )}
    </Stack>
  );
}
