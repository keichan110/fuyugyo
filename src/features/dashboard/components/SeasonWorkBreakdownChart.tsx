import { DonutChart } from '@mantine/charts';
import { Box, Group, Stack, Text, Title } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { SeasonWorkBreakdownItem } from '@/features/shifts/schema';

const BREAKDOWN_PALETTE = ['blue.6', 'orange.6', 'teal.6', 'grape.6', 'cyan.6', 'pink.6', 'lime.6'];

/** 勤務内訳の1セグメントをグラフと凡例で共通して使う表示データに変換する。 */
function buildChartData(breakdown: SeasonWorkBreakdownItem[]) {
  return breakdown.map((item, index) => {
    const department = getDepartmentAppearance(item.departmentCode);
    return {
      name: `${department.label} / ${item.shiftTypeName}`,
      value: item.count,
      color: BREAKDOWN_PALETTE[index % BREAKDOWN_PALETTE.length] ?? 'gray.6',
    };
  });
}

/**
 * 今シーズンの勤務回数を、部門とシフト種別の組み合わせで表示するドーナツグラフカード。
 * セグメントを重複しない組み合わせ単位にすることで、中央の合計は実際の勤務回数と一致する。
 */
export function SeasonWorkBreakdownChart({ breakdown }: { breakdown: SeasonWorkBreakdownItem[] }) {
  const data = buildChartData(breakdown);
  const totalCount = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Stack gap="md">
      <Title order={3} size="h4">
        勤務内訳
      </Title>
      {data.length === 0 ? (
        <Text size="sm" c="dimmed">
          今シーズンの勤務実績はまだありません。
        </Text>
      ) : (
        <Stack gap="md">
          <Box pos="relative" maw={320} mx="auto">
            <DonutChart
              data={data}
              withTooltip
              thickness={36}
              valueFormatter={(value) => `${value}回`}
            />
            <Stack
              gap={0}
              align="center"
              justify="center"
              pos="absolute"
              inset={0}
              style={{ pointerEvents: 'none' }}
            >
              <Text size="xs" c="dimmed">
                合計
              </Text>
              <Text fw={700} size="xl">
                {totalCount}回
              </Text>
            </Stack>
          </Box>
          <Stack gap="xs">
            {data.map((item) => (
              <Group key={item.name} justify="space-between" gap="sm">
                <Group gap="xs" wrap="nowrap">
                  <Box
                    w={10}
                    h={10}
                    bg={item.color}
                    style={{ borderRadius: '50%', flexShrink: 0 }}
                  />
                  <Text size="sm">{item.name}</Text>
                </Group>
                <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {item.value}回 {Math.round((item.value / totalCount) * 100)}%
                </Text>
              </Group>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
