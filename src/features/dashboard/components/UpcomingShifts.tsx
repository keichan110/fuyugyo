import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import { useMe } from '@/features/auth/queries';
import { useShifts } from '@/features/shifts/queries';
import { formatDate, shortDateLabel, todayString } from '@/features/shifts/view-utils';

/** ダッシュボードに表示する直近シフトの件数 */
const UPCOMING_SHIFTS_LIMIT = 5;

/**
 * 直近の勤務予定パネル。連携済み Instructor の本日以降のシフトを最大5件表示し、
 * シフト全体（`/shifts`）への導線を提供する。
 */
export function UpcomingShifts() {
  const { data: user } = useMe();
  const { data: shifts, isLoading } = useShifts(
    user?.instructorId
      ? {
          dateFrom: todayString(),
          instructorId: user.instructorId,
          limit: UPCOMING_SHIFTS_LIMIT,
        }
      : undefined,
  );

  const upcoming = (shifts ?? [])
    .map((shift) => ({ ...shift, dateStr: formatDate(shift.date) }))
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .slice(0, UPCOMING_SHIFTS_LIMIT);

  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" align="center" mb="sm">
        <Title order={3} size="h4">
          直近の勤務予定
        </Title>
        <Button component={Link} to="/shifts" variant="outline" size="sm">
          シフト全体を見る
        </Button>
      </Group>

      {!user?.instructorId && (
        <Text c="dimmed" size="sm">
          インストラクターと連携すると、ここに直近の勤務予定が表示されます。
        </Text>
      )}

      {user?.instructorId && isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}

      {user?.instructorId && !isLoading && upcoming.length === 0 && (
        <Text c="dimmed" size="sm">
          直近の勤務予定はありません。
        </Text>
      )}

      {upcoming.length > 0 && (
        <Stack gap="xs">
          {upcoming.map((shift) => (
            <Group key={shift.id} justify="space-between" px="sm" py="xs" bg="gray.0">
              <Text size="sm">{shortDateLabel(shift.dateStr)}</Text>
              <Text size="sm" c="dimmed">
                {shift.departmentName} / {shift.shiftTypeName}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}
