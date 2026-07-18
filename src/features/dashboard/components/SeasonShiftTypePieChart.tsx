import { PieChart } from '@mantine/charts';
import { Card, Text, Title } from '@mantine/core';

import type { SeasonShiftTypeBreakdownItem } from '@/features/shifts/schema';

/**
 * シフト種別は部門のような固定の色定義を持たないため、円グラフ用に巡回で割り当てる
 * 簡易パレット（仮実装用。本実装では配色を見直す）。
 */
const SHIFT_TYPE_PALETTE = ['blue', 'orange', 'teal', 'grape', 'yellow', 'cyan', 'pink', 'lime'];

/**
 * シフト種別別勤務比率の円グラフカード（今シーズン、勤務回数ベース）。
 * Issue #203 採用アイデア「シフト種別別の勤務比率」。
 */
export function SeasonShiftTypePieChart({
  byShiftType,
}: {
  byShiftType: SeasonShiftTypeBreakdownItem[];
}) {
  const data = byShiftType.map((item, index) => ({
    name: item.shiftTypeName,
    value: item.count,
    color: SHIFT_TYPE_PALETTE[index % SHIFT_TYPE_PALETTE.length] ?? 'gray',
  }));

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        シフト種別別の勤務比率
      </Title>
      {data.length === 0 ? (
        <Text size="sm" c="dimmed">
          今シーズンの勤務実績はまだありません。
        </Text>
      ) : (
        <PieChart
          data={data}
          withLabels
          labelsType="percent"
          withTooltip
          withLegend
          valueFormatter={(value) => `${value}回`}
        />
      )}
    </Card>
  );
}
