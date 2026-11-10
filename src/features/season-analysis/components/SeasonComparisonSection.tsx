import { BarChart } from '@mantine/charts';
import { Group, Stack, Text } from '@mantine/core';

import {
  comparisonPeriodLabel,
  summarizeComparison,
  type ComparisonView,
  type MemberChange,
} from '../comparison';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${value}日`;
}

function MemberList({ label, members }: { label: string; members: MemberChange[] }) {
  return (
    <Text size="sm">
      {label}：
      {members.length === 0
        ? 'なし'
        : members.map((m) => `${m.name} ${formatSigned(m.diff)}`).join('、')}
    </Text>
  );
}

/** F の要約。比較期間、延べ勤務日数の増減、増減の大きいメンバーを示す。 */
export function ComparisonSummary({ view, season }: { view: ComparisonView; season: number }) {
  const summary = summarizeComparison(view);
  const percent =
    summary.diffPercent === null
      ? ''
      : `、${summary.diffPercent > 0 ? '+' : ''}${summary.diffPercent.toFixed(1)}%`;
  return (
    <Stack gap={4}>
      <Text size="sm">
        {comparisonPeriodLabel(view)}（実施済みのみ）。延べ勤務日数 {season}シーズン{' '}
        {summary.currentTotal}日 ／ {season - 1}シーズン {summary.previousTotal}日（
        {formatSigned(summary.diff)}
        {percent}）
      </Text>
      <Group gap="lg">
        <MemberList label="増加が大きい" members={summary.topIncreases} />
        <MemberList label="減少が大きい" members={summary.topDecreases} />
      </Group>
    </Stack>
  );
}

/** F: 月別の延べ勤務日数（選択シーズンと前シーズンのグループ棒）。 */
export function ComparisonMonthlyChart({
  view,
  season,
  expanded,
}: {
  view: ComparisonView;
  season: number;
  expanded: boolean;
}) {
  const currentLabel = `${season}シーズン`;
  return (
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
        { name: 'previous', color: 'gray.5', label: `${season - 1}シーズン` },
      ]}
      withLegend
      yAxisProps={{ allowDecimals: false }}
      valueFormatter={(value) => `${value}日`}
      aria-label="月別の延べ勤務日数。選択シーズンと前シーズンの比較"
    />
  );
}

/** F: メンバー別の増減（増=青・減=赤の積み上げ横棒）。 */
export function ComparisonMemberChart({
  view,
  expanded,
}: {
  view: ComparisonView;
  expanded: boolean;
}) {
  return (
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
  );
}
