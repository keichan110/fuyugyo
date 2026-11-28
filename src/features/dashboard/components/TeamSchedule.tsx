import { useState } from 'react';

import { Anchor, Box, Divider, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import { useShiftAttendance } from '@/features/shifts/queries';
import type { ShiftViewItem } from '@/features/shifts/schema';
import {
  addDays,
  getCalendarDayColor,
  shortDateLabel,
  WEEKDAY_LABELS,
  weekdayIndex,
} from '@/features/shifts/view-utils';

import { DashboardSection } from './DashboardSection';
import { DashboardShiftRow } from './DashboardShiftRow';
import classes from './TeamSchedule.module.css';

/** 全体の予定に並べる日数 */
const TEAM_SCHEDULE_DAYS = 7;

/**
 * 全体の予定セクション。今日から連続7日の日付を並べ、選んだ日の勤務枠と担当者を表示する。
 * 自分の勤務がある日には点を付け、自分が含まれる行を強調する。
 * インストラクター未連携（`instructorId` が null）の場合は目印と強調なしで表示する。
 */
export function TeamSchedule({
  instructorId,
  today,
}: {
  instructorId: string | null;
  today: string;
}) {
  const dates = Array.from({ length: TEAM_SCHEDULE_DAYS }, (_, offset) => addDays(today, offset));
  /** 利用者が選んだ日。未選択なら今日を表示する */
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // 表示中に日付が変わると選んだ日が範囲外になるため、その場合も今日を表示する
  const activeDate = pickedDate && dates.includes(pickedDate) ? pickedDate : today;
  const { data, isLoading, isError } = useShiftAttendance(dates);

  // 取得に失敗している間は、古い結果を根拠に勤務や目印を表示しない
  const shifts = isError ? [] : (data ?? []);
  const workingDates = new Set(
    shifts
      .filter((shift) =>
        shift.assignedInstructors.some((instructor) => instructor.id === instructorId),
      )
      .map((shift) => shift.date),
  );

  return (
    <DashboardSection
      title="全体の予定"
      action={
        <Anchor
          size="sm"
          // 検索パラメータの型検査を保つため、Link をそのまま描画する
          renderRoot={(props) => <Link {...props} to="/shifts" search={{ date: today }} />}
        >
          シフト表へ
        </Anchor>
      }
    >
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Box className={classes.days} role="group" aria-label="表示する日">
          {dates.map((date) => (
            <DayButton
              key={date}
              date={date}
              isToday={date === today}
              selected={date === activeDate}
              working={workingDates.has(date)}
              onSelect={() => setPickedDate(date)}
            />
          ))}
        </Box>
        <Divider />
        <DayPanel
          date={activeDate}
          // サーバー側で部門・シフト種別順に整列済みのため、取得順を維持したまま絞り込む
          shifts={shifts.filter((shift) => shift.date === activeDate)}
          isLoading={isLoading}
          isError={isError}
          instructorId={instructorId}
        />
      </Paper>
    </DashboardSection>
  );
}

/** 日付を選ぶボタン。曜日（今日は「今日」）・日・自分の勤務を示す点を縦に並べる */
function DayButton({
  date,
  isToday,
  selected,
  working,
  onSelect,
}: {
  date: string;
  isToday: boolean;
  selected: boolean;
  working: boolean;
  onSelect: () => void;
}) {
  const label = [
    isToday ? `今日 ${shortDateLabel(date)}` : shortDateLabel(date),
    ...(working ? ['自分の勤務あり'] : []),
  ].join('、');

  return (
    <UnstyledButton
      className={classes.day}
      data-day-color={getCalendarDayColor(date)}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
    >
      <Text component="span" size="xs" lh={1.2}>
        {isToday ? '今日' : WEEKDAY_LABELS[weekdayIndex(date)]}
      </Text>
      <Text component="span" size="md" fw={700} lh={1.4}>
        {Number(date.slice(8, 10))}
      </Text>
      <span className={classes.dot} data-working={working || undefined} />
    </UnstyledButton>
  );
}

/** 選んだ日の勤務枠一覧 */
function DayPanel({
  date,
  shifts,
  isLoading,
  isError,
  instructorId,
}: {
  date: string;
  shifts: ShiftViewItem[];
  isLoading: boolean;
  isError: boolean;
  instructorId: string | null;
}) {
  return (
    <Stack gap={4} p="xs" aria-live="polite">
      <Text size="sm" c="dimmed" px="xs">
        {shortDateLabel(date)}
      </Text>

      {isLoading && (
        <Text c="dimmed" size="sm" px="xs" py="sm">
          読み込み中…
        </Text>
      )}

      {!isLoading && isError && (
        <Text c="dimmed" size="sm" px="xs" py="sm">
          出勤状況を取得できませんでした。
        </Text>
      )}

      {!isLoading && !isError && shifts.length === 0 && (
        <Text c="dimmed" size="sm" px="xs" py="sm">
          この日の勤務予定はありません。
        </Text>
      )}

      {!isLoading &&
        shifts.map((shift) => (
          <DashboardShiftRow key={shift.id} shift={shift} instructorId={instructorId} />
        ))}
    </Stack>
  );
}
