import { Box, Card, Stack, Text, Title } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import { ShiftAttendeeRow } from '@/features/shifts/components/ShiftAttendeeRow';
import { useShiftAttendance, useShifts } from '@/features/shifts/queries';
import type { ShiftViewItem } from '@/features/shifts/schema';
import { formatDate, shortDateLabel, todayString } from '@/features/shifts/view-utils';

import classes from './UpcomingShifts.module.css';

/** ダッシュボードに表示する直近シフトの件数 */
const UPCOMING_SHIFTS_LIMIT = 3;

/** 日付ごとにグルーピングした直近シフト（同僚の表示名付き）の1グループ */
type UpcomingShiftGroup = {
  dateStr: string;
  shifts: ShiftViewItem[];
};

/**
 * 直近の勤務予定パネル。連携済み Instructor の本日以降のシフトを最大3件、
 * 同じシフトに割り当てられた同僚（表示名）とあわせて表示する
 * （Issue #202 の「同じ日に勤務する同僚一覧」第一段）。
 * 未連携ユーザーには呼び出し元（ダッシュボード）がそもそも描画しない前提
 */
export function UpcomingShifts({ instructorId }: { instructorId: string }) {
  // 1. 自分の直近シフトを取得し、日付昇順で先頭5件に絞る
  const { data: myShifts, isLoading: isMyShiftsLoading } = useShifts({
    dateFrom: todayString(),
    instructorId,
    limit: UPCOMING_SHIFTS_LIMIT,
  });

  const upcoming = (myShifts ?? [])
    .map((shift) => ({ ...shift, dateStr: formatDate(shift.date) }))
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .slice(0, UPCOMING_SHIFTS_LIMIT);

  // 2. 重複を除いた日付配列（昇順）を出勤状況取得のクエリキーに使う
  const dates = [...new Set(upcoming.map((shift) => shift.dateStr))];

  // 3. 同じ日の全出勤者（表示名付き）を取得する。部門フィルタは渡さない
  const {
    data: attendance,
    isLoading: isAttendanceLoading,
    isError: isAttendanceError,
  } = useShiftAttendance(dates);

  // Shift id → 表示名付き ShiftViewItem。id 照合で自分のシフトに対応する詳細を引く
  const attendanceById = new Map((attendance ?? []).map((item) => [item.id, item]));

  const isLoading = isMyShiftsLoading || (dates.length > 0 && isAttendanceLoading);

  // 4. upcoming の日付昇順を維持したまま日付でグルーピングする。
  // attendance 未到着の行は起こり得ないが、念のためロード完了後にスキップする
  const groups: UpcomingShiftGroup[] = [];
  if (!isLoading && !isAttendanceError) {
    for (const shift of upcoming) {
      const viewItem = attendanceById.get(shift.id);
      if (!viewItem) {
        continue;
      }
      const lastGroup = groups.at(-1);
      if (lastGroup && lastGroup.dateStr === shift.dateStr) {
        lastGroup.shifts.push(viewItem);
      } else {
        groups.push({ dateStr: shift.dateStr, shifts: [viewItem] });
      }
    }
  }

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

      {!isLoading && upcoming.length > 0 && isAttendanceError && (
        <Text c="dimmed" size="sm">
          出勤状況を取得できませんでした。
        </Text>
      )}

      {!isLoading && upcoming.length > 0 && !isAttendanceError && (
        <Stack gap="sm">
          {groups.map((group) => (
            <Stack key={group.dateStr} gap={4}>
              <Text size="sm" c="dimmed">
                {shortDateLabel(group.dateStr)}
              </Text>
              <Stack gap={0}>
                {group.shifts.map((viewItem) => (
                  <Box key={viewItem.id} className={classes.shiftRow}>
                    <Box
                      className={classes.departmentBar}
                      bg={
                        getDepartmentAppearance(viewItem.department.code, viewItem.department.name)
                          .color
                      }
                    />
                    <ShiftAttendeeRow shift={viewItem} myInstructorId={instructorId} />
                  </Box>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Card>
  );
}
