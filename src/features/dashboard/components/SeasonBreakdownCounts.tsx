import { Card, Group, Stack, Text, Title } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import type {
  SeasonDepartmentBreakdownItem,
  SeasonShiftTypeBreakdownItem,
} from '@/features/shifts/schema';

/** 部門色のスウォッチ＋ラベル＋件数の1行 */
function DepartmentRow({ item }: { item: SeasonDepartmentBreakdownItem }) {
  const appearance = getDepartmentAppearance(item.departmentCode);
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <Text size="sm" c={appearance.color} fw={600}>
          ●
        </Text>
        <Text size="sm">{appearance.label}</Text>
      </Group>
      <Text size="sm" c="dimmed">
        {item.count}回
      </Text>
    </Group>
  );
}

/** シフト種別名＋件数の1行 */
function ShiftTypeRow({ item }: { item: SeasonShiftTypeBreakdownItem }) {
  return (
    <Group justify="space-between">
      <Text size="sm">{item.shiftTypeName}</Text>
      <Text size="sm" c="dimmed">
        {item.count}回
      </Text>
    </Group>
  );
}

/**
 * 部門別・シフト種別別の勤務回数内訳カード（今シーズン）。
 * Issue #203 採用アイデア「部門別・シフト種別別の勤務回数内訳」。
 */
export function SeasonBreakdownCounts({
  byDepartment,
  byShiftType,
}: {
  byDepartment: SeasonDepartmentBreakdownItem[];
  byShiftType: SeasonShiftTypeBreakdownItem[];
}) {
  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        勤務回数の内訳（今シーズン）
      </Title>
      <Stack gap="lg">
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            部門別
          </Text>
          {byDepartment.length === 0 ? (
            <Text size="sm" c="dimmed">
              今シーズンの勤務実績はまだありません。
            </Text>
          ) : (
            byDepartment.map((item) => <DepartmentRow key={item.departmentCode} item={item} />)
          )}
        </Stack>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            シフト種別別
          </Text>
          {byShiftType.length === 0 ? (
            <Text size="sm" c="dimmed">
              今シーズンの勤務実績はまだありません。
            </Text>
          ) : (
            byShiftType.map((item) => <ShiftTypeRow key={item.shiftTypeId} item={item} />)
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
