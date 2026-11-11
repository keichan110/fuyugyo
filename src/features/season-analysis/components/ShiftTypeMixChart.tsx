import { BarChart } from '@mantine/charts';
import { Paper, Text } from '@mantine/core';

import type { ShiftTypeMix } from '../shift-type-mix';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

/** 同名メンバーが混ざっても軸ラベルが衝突しないよう、重複には連番を付ける */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}(${count})`;
  });
}

/** メンバー別の勤務種別の構成比（100%積み上げ横棒）。量ではなく割合を比べる。 */
export function ShiftTypeMixChart({ mix, expanded }: { mix: ShiftTypeMix; expanded: boolean }) {
  if (mix.series.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        配置がありません。
      </Text>
    );
  }
  const [only] = mix.series;
  if (mix.series.length === 1 && only) {
    return (
      <Text size="sm" c="dimmed">
        対象期間の勤務種別は{only.label}のみです
      </Text>
    );
  }
  const labels = uniqueNames(mix.members.map((member) => member.name));
  // dataKey に使える安全な名前（s0, s1...）を系列の表示順に振る
  const seriesNames = mix.series.map((series, index) => ({ ...series, name: `s${index}` }));
  const data = mix.members.map((member, index) => ({
    name: labels[index] ?? member.name,
    ...Object.fromEntries(seriesNames.map((s) => [s.name, member.counts[s.key] ?? 0])),
  }));
  const memberByLabel = new Map(mix.members.map((member, index) => [labels[index], member]));
  return (
    <BarChart
      h={Math.max(expanded ? 320 : PANEL_CHART_HEIGHT, mix.members.length * 28 + 60)}
      data={data}
      dataKey="name"
      orientation="vertical"
      type="percent"
      series={seriesNames.map((s) => ({
        name: s.name,
        label: s.label,
        color: s.color,
      }))}
      withLegend
      yAxisProps={{ width: 96 }}
      tooltipProps={{
        content: ({ label }) => {
          const member = memberByLabel.get(String(label));
          if (!member) return null;
          return (
            <Paper withBorder shadow="sm" p="xs">
              <Text size="sm" fw={600}>
                {member.name}：合計 {member.total}回
              </Text>
              {seriesNames.map((s) => (
                <Text key={s.key} size="xs">
                  {s.label}：{Math.round(member.shares[s.key] ?? 0)}%（{member.counts[s.key] ?? 0}
                  回）
                </Text>
              ))}
            </Paper>
          );
        },
      }}
      aria-label="メンバー別の勤務種別の構成比。配置回数に占める割合の100%積み上げ"
    />
  );
}
