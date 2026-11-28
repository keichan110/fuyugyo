import { Badge, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import dayjs from 'dayjs';

import { AppBadge } from '@/components/AppBadge';
import { useShiftAttendance, useShifts } from '@/features/shifts/queries';
import type { ShiftViewItem } from '@/features/shifts/schema';
import { formatDate, shortDateLabel } from '@/features/shifts/view-utils';

import { DashboardShiftRow } from './DashboardShiftRow';

/** ダッシュボードに表示する直近シフトの件数 */
const UPCOMING_SHIFTS_LIMIT = 3;

/** 日付ごとにグルーピングした直近シフト（同僚の表示名付き）の1グループ */
type UpcomingShiftGroup = {
  dateStr: string;
  shifts: ShiftViewItem[];
};

/**
 * 次回勤務日までのカウントダウンバッジ（Issue #202）。
 * 当日勤務の場合は日数ではなく Mint の塗りの「今日」で目立たせる
 */
function CountdownBadge({ dateStr, today }: { dateStr: string; today: string }) {
  const diffDays = dayjs(dateStr).diff(dayjs(today), 'day');
  return diffDays <= 0 ? (
    <AppBadge kind="highlight" size="sm">
      今日
    </AppBadge>
  ) : (
    <Badge size="sm" variant="light" color="brand">
      あと{diffDays}日
    </Badge>
  );
}

/**
 * 直近の勤務予定パネル。連携済み Instructor の今日以降のシフトを最大3件、
 * 同じシフトに割り当てられた同僚（表示名）とあわせて表示する
 * （Issue #202 の「同じ日に勤務する同僚一覧」第一段）。
 */
export function UpcomingShifts({ instructorId, today }: { instructorId: string; today: string }) {
  // 1. 自分の直近シフトを取得し、日付昇順で先頭3件に絞る
  const {
    data: myShifts,
    isLoading: isMyShiftsLoading,
    isError: isMyShiftsError,
  } = useShifts({ dateFrom: today, instructorId, limit: UPCOMING_SHIFTS_LIMIT });

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
  const errorMessage = isMyShiftsError
    ? '勤務予定を取得できませんでした。'
    : isAttendanceError
      ? '出勤状況を取得できませんでした。'
      : null;

  // 4. upcoming の日付昇順を維持したまま日付でグルーピングする。
  // attendance 未到着の行は起こり得ないが、念のためロード完了後にスキップする
  const groups: UpcomingShiftGroup[] = [];
  if (!isLoading && !errorMessage) {
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
    <Paper withBorder radius="md" p="xs">
      {isLoading && (
        <Text c="dimmed" size="sm" p="xs">
          読み込み中…
        </Text>
      )}

      {!isLoading && errorMessage && (
        <Text c="dimmed" size="sm" p="xs">
          {errorMessage}
        </Text>
      )}

      {!isLoading && !errorMessage && upcoming.length === 0 && (
        <Text c="dimmed" size="sm" p="xs">
          直近の勤務予定はありません。
        </Text>
      )}

      {groups.length > 0 && (
        <Stack gap="xs">
          {groups.map((group, index) => (
            <Stack key={group.dateStr} gap={4}>
              {index > 0 && <Divider mb={4} />}
              <Group gap={6} px="xs">
                <Text size="sm" c="dimmed">
                  {shortDateLabel(group.dateStr)}
                </Text>
                {/* 次回勤務（先頭グループ）にのみカウントダウンを表示する */}
                {index === 0 && <CountdownBadge dateStr={group.dateStr} today={today} />}
              </Group>
              {group.shifts.map((viewItem) => (
                <DashboardShiftRow key={viewItem.id} shift={viewItem} instructorId={instructorId} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
