import { Card, Group, Stack, Text, Title } from '@mantine/core';

import { useShifts } from '@/features/shifts/queries';
import { formatDate, shortDateLabel, todayString } from '@/features/shifts/view-utils';

/** ダッシュボードに表示する直近シフトの件数 */
const UPCOMING_SHIFTS_LIMIT = 5;

/**
 * 直近の勤務予定パネル。連携済み Instructor の本日以降のシフトを最大5件表示する。
 * 未連携ユーザーには呼び出し元（ダッシュボード）がそもそも描画しない前提
 */
export function UpcomingShifts({ instructorId }: { instructorId: string }) {
  const { data: shifts, isLoading } = useShifts({
    dateFrom: todayString(),
    instructorId,
    limit: UPCOMING_SHIFTS_LIMIT,
  });

  const upcoming = (shifts ?? [])
    .map((shift) => ({ ...shift, dateStr: formatDate(shift.date) }))
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .slice(0, UPCOMING_SHIFTS_LIMIT);

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        直近の勤務予定
      </Title>

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}

      {!isLoading && upcoming.length === 0 && (
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
