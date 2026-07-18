import { PieChart } from '@mantine/charts';
import { Card, Text, Title } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { SeasonDepartmentBreakdownItem } from '@/features/shifts/schema';

/**
 * 部門別勤務比率の円グラフカード（今シーズン、勤務回数ベース）。
 * Issue #203 採用アイデア「部門別勤務比率の円グラフ」。
 */
export function SeasonDepartmentPieChart({
  byDepartment,
}: {
  byDepartment: SeasonDepartmentBreakdownItem[];
}) {
  const data = byDepartment.map((item) => {
    const appearance = getDepartmentAppearance(item.departmentCode);
    return { name: appearance.label, value: item.count, color: appearance.color };
  });

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        部門別の勤務比率
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
