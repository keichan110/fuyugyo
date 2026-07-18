import { Box, Card, Stack, Tabs, Text, Title } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import { ShiftAttendeeRow } from '@/features/shifts/components/ShiftAttendeeRow';
import { useShiftAttendance } from '@/features/shifts/queries';
import type { ShiftViewItem } from '@/features/shifts/schema';
import { addDays, shortDateLabel, todayString } from '@/features/shifts/view-utils';

import classes from './CurrentAttendance.module.css';

/**
 * 本日・明日の出勤状況セクション。全インストラクターの出勤を部門・シフト種別ごとに
 * 本日/明日タブで表示し、自分が含まれる行を強調する。
 */
export function CurrentAttendance({ instructorId }: { instructorId: string }) {
  const today = todayString();
  const tomorrow = addDays(today, 1);
  const { data, isLoading, isError } = useShiftAttendance([today, tomorrow]);

  // サーバー側で部門・シフト種別順に整列済みのため、取得順を維持したまま日付で振り分ける
  const todayShifts = (data ?? []).filter((shift) => shift.date === today);
  const tomorrowShifts = (data ?? []).filter((shift) => shift.date === tomorrow);

  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        本日・明日の出勤
      </Title>

      <Tabs defaultValue="today">
        <Tabs.List>
          <Tabs.Tab value="today">本日</Tabs.Tab>
          <Tabs.Tab value="tomorrow">明日</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="today" pt="sm">
          <AttendanceDayPanel
            date={today}
            shifts={todayShifts}
            isLoading={isLoading}
            isError={isError}
            emptyMessage="本日の出勤予定はありません。"
            instructorId={instructorId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="tomorrow" pt="sm">
          <AttendanceDayPanel
            date={tomorrow}
            shifts={tomorrowShifts}
            isLoading={isLoading}
            isError={isError}
            emptyMessage="明日の出勤予定はありません。"
            instructorId={instructorId}
          />
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
}

/** 1タブ分（本日 or 明日）の出勤者一覧パネル */
function AttendanceDayPanel({
  date,
  shifts,
  isLoading,
  isError,
  emptyMessage,
  instructorId,
}: {
  date: string;
  shifts: ShiftViewItem[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  instructorId: string;
}) {
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {shortDateLabel(date)}
      </Text>

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}

      {!isLoading && isError && (
        <Text c="dimmed" size="sm">
          出勤状況を取得できませんでした。
        </Text>
      )}

      {!isLoading && !isError && shifts.length === 0 && (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      )}

      {!isLoading && !isError && shifts.length > 0 && (
        <Stack gap={0}>
          {shifts.map((shift) => (
            <Box
              key={shift.id}
              className={classes.attendeeRow}
              data-includes-me={
                shift.assignedInstructors.some((instructor) => instructor.id === instructorId) ||
                undefined
              }
            >
              <Box
                className={classes.departmentBar}
                bg={getDepartmentAppearance(shift.department.code, shift.department.name).color}
              />
              <ShiftAttendeeRow shift={shift} myInstructorId={instructorId} />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
