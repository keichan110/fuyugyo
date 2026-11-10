import { Card, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';

import type { DayAssignments } from './calendar-events';
import { monthlyStaffingDistribution } from './monthly-staffing-data';

/** 当月の充足・不足・過員・未設定を、日数と構成比で俯瞰する。 */
export function MonthlyStaffingSummary({
  days,
  requiredByDay,
  assignmentsByDay,
}: {
  days: string[];
  requiredByDay: ReadonlyMap<string, number | null> | null;
  assignmentsByDay: DayAssignments;
}) {
  if (requiredByDay === null)
    return (
      <Text size="sm" c="dimmed">
        必要人数を読み込み中…
      </Text>
    );
  const distribution = monthlyStaffingDistribution(
    days.map((date) => ({
      required: requiredByDay.get(date) ?? null,
      assigned: assignmentsByDay.get(date)?.length ?? 0,
    })),
  );
  const noRequirements =
    days.length > 0 && distribution.find((item) => item.status === 'unset')?.count === days.length;
  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            当月の充足状況
          </Text>
          {noRequirements && (
            <Text size="xs" c="dimmed">
              未判定
            </Text>
          )}
        </Group>
        <Progress.Root
          size={14}
          aria-label={distribution.map((item) => `${item.label}${item.count}日`).join('、')}
        >
          {distribution
            .filter((item) => item.count > 0)
            .map((item) => (
              <Tooltip key={item.status} label={`${item.label} ${item.count}日`}>
                <Progress.Section
                  value={days.length ? (item.count / days.length) * 100 : 0}
                  color={item.color}
                />
              </Tooltip>
            ))}
        </Progress.Root>
        <Group gap="md">
          {distribution
            .filter((item) => item.count > 0)
            .map((item) => (
              <Group key={item.status} gap={5}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: `var(--mantine-color-${item.color.replace('.', '-')})`,
                  }}
                />
                <Text size="xs" c={item.count ? 'inherit' : 'dimmed'}>
                  {item.label}{' '}
                  <Text component="span" fw={600}>
                    {item.count}
                  </Text>
                  日
                </Text>
              </Group>
            ))}
        </Group>
        {noRequirements && (
          <Text size="xs" c="dimmed">
            必要人数の設定後に充足状況を判定します。
          </Text>
        )}
      </Stack>
    </Card>
  );
}
