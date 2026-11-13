import { useCallback, useMemo, useState } from 'react';

import { Box, Group, Modal, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { MonthView, ScheduleHeader, type ScheduleEventData } from '@mantine/schedule';
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconLock,
  IconNote,
} from '@tabler/icons-react';
import { useBlocker } from '@tanstack/react-router';

import 'dayjs/locale/ja';

import { ErrorAlert, WarningAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { addDays, addMonths, getCalendarDayColor, toMonth } from '@/features/shifts/view-utils';
import { clampScheduleMonth, scheduleMaximumDate, scheduleToday } from '@/lib/schedule-date-range';

import {
  applyBulkAvailability,
  buildAvailabilityChanges,
  getDateEditability,
  listMonthDates,
  stageAvailability,
  type StagedAvailability,
} from '../editor';
import { useMyAvailabilities, useUpdateMyAvailabilities } from '../queries';
import type { Availability } from '../schema';
import { AvailabilityBulkModal } from './AvailabilityBulkModal';
import classes from './AvailabilityCalendar.module.css';
import { AvailabilityDayModal } from './AvailabilityDayModal';

/** 本人が月間カレンダー上で勤務可・要調整・勤務不可をまとめて申告する画面。 */
export function AvailabilityCalendar({ initialMonth }: { initialMonth?: string }) {
  const [month, setMonth] = useState(() =>
    clampScheduleMonth(initialMonth ?? scheduleToday().slice(0, 7), scheduleToday()),
  );
  const availabilityQuery = useMyAvailabilities(month);
  const updateMutation = useUpdateMyAvailabilities();
  const [staged, setStaged] = useState<Map<string, StagedAvailability>>(new Map());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [bulkOpened, setBulkOpened] = useState(false);
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);

  const saved = useMemo(
    () =>
      new Map(
        (availabilityQuery.data?.availabilities ?? []).map((availability) => [
          availability.date,
          { type: availability.type, note: availability.note },
        ]),
      ),
    [availabilityQuery.data],
  );
  const lockedDates = useMemo(
    () => new Set(availabilityQuery.data?.lockedDates ?? []),
    [availabilityQuery.data],
  );
  const changes = useMemo(() => buildAvailabilityChanges(saved, staged), [saved, staged]);
  const changedDates = useMemo(() => new Set(changes.map((change) => change.date)), [changes]);
  const availabilityDates = useMemo(
    () => new Set([...saved.keys(), ...staged.keys()]),
    [saved, staged],
  );
  const hasChanges = changes.length > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => hasChanges,
    enableBeforeUnload: () => hasChanges,
    withResolver: true,
  });

  const getValue = useCallback(
    (date: string): StagedAvailability | undefined => staged.get(date) ?? saved.get(date),
    [staged, saved],
  );
  // 入力可能（過去日・公開済みシフト日を除く）なのに申告がない日を、未保存の編集も含めて数える。
  const unfilledCount = useMemo(() => {
    const today = scheduleToday();
    return listMonthDates(month).filter(
      (date) =>
        getDateEditability(date, today, lockedDates) === 'editable' && getValue(date) === undefined,
    ).length;
  }, [month, lockedDates, getValue]);
  const save = async () => {
    if (!hasChanges) return;
    await updateMutation.mutateAsync({ changes });
    setStaged(new Map());
  };
  const changeMonth = (nextMonth: string) => {
    setStaged(new Map());
    setEditingDate(null);
    setBulkOpened(false);
    setMonth(nextMonth);
  };
  const requestMonthChange = (requestedMonth: string) => {
    const nextMonth = clampScheduleMonth(requestedMonth, scheduleToday());
    if (nextMonth === month) return;
    if (hasChanges) {
      setPendingMonth(nextMonth);
      return;
    }
    changeMonth(nextMonth);
  };
  const discardChangesAndChangeMonth = () => {
    if (!pendingMonth) return;
    changeMonth(pendingMonth);
    setPendingMonth(null);
  };

  return (
    <>
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            日付をタップするか「一括設定」から勤務の可否を入力してください。
          </Text>
        </Stack>
        {availabilityQuery.isError && <ErrorAlert>{availabilityQuery.error.message}</ErrorAlert>}
        {updateMutation.isError && <ErrorAlert>{updateMutation.error.message}</ErrorAlert>}
        {availabilityQuery.isLoading ? (
          <Text c="dimmed">読み込み中...</Text>
        ) : (
          <AvailabilityMonthView
            month={month}
            availabilityDates={availabilityDates}
            getValue={getValue}
            changedDates={changedDates}
            lockedDates={lockedDates}
            onMonthChange={(nextMonth) => requestMonthChange(toMonth(nextMonth))}
            onEditDate={setEditingDate}
            onOpenBulk={() => setBulkOpened(true)}
          />
        )}
        {availabilityQuery.isSuccess && unfilledCount > 0 && (
          <WarningAlert>
            入力できる日のうち {unfilledCount}日が未入力です。未入力の日も自動割当の対象になります。
          </WarningAlert>
        )}
      </Stack>

      {hasChanges && (
        <UnsavedChangesBar
          count={changes.length}
          description="表示中の月の変更をまとめて保存します"
          loading={updateMutation.isPending}
          onCancel={() => setStaged(new Map())}
          onSave={() => void save()}
        />
      )}

      <AvailabilityDayModal
        date={editingDate}
        current={editingDate ? getValue(editingDate) : undefined}
        onClose={() => setEditingDate(null)}
        onSubmit={(date, value) => setStaged((current) => stageAvailability(current, date, value))}
      />
      <AvailabilityBulkModal
        opened={bulkOpened}
        onClose={() => setBulkOpened(false)}
        month={month}
        today={scheduleToday()}
        lockedDates={lockedDates}
        getCurrent={getValue}
        onApply={(targetDates, type) =>
          setStaged((current) => applyBulkAvailability(current, targetDates, type, getValue))
        }
      />
      <Modal
        opened={blocker.status === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text>このページを離れると、保存していない変更は失われます。</Text>
          <Group justify="flex-end">
            <AppButton intent="secondary" onClick={() => blocker.reset?.()}>
              このページに残る
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={() => blocker.proceed?.()}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={pendingMonth !== null}
        onClose={() => setPendingMonth(null)}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text>月を移動すると、保存していない変更は失われます。</Text>
          <Group justify="flex-end">
            <AppButton intent="secondary" onClick={() => setPendingMonth(null)}>
              この月に残る
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={discardChangesAndChangeMonth}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** YYYY-MM-DD をカレンダーのアクセシブルな日付ラベルへ整形する。 */
function formatDateLabel(date: string): string {
  return `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

/** 申告状態ごとのカレンダー表示（ラベル・イベント色・アイコン）。 */
const AVAILABILITY_DISPLAY = {
  AVAILABLE: {
    title: '勤務可',
    color: 'green',
    Icon: IconCircleCheckFilled,
    iconColor: 'var(--mantine-color-green-6)',
  },
  AVOID: {
    title: '要調整',
    color: 'yellow',
    Icon: IconAlertTriangleFilled,
    iconColor: 'var(--mantine-color-yellow-8)',
  },
  UNAVAILABLE: {
    title: '勤務不可',
    color: 'red',
    Icon: IconCircleXFilled,
    iconColor: 'var(--mantine-color-red-6)',
  },
} satisfies Record<Availability['type'], unknown>;

/** 申告状態に対応するカレンダー上のアイコン。 */
function AvailabilityIcon({ type }: { type: Availability['type'] }) {
  const { Icon, iconColor } = AVAILABILITY_DISPLAY[type];
  return <Icon size={28} color={iconColor} aria-hidden />;
}

/** カレンダーとヘッダー部品で共有する日本語ラベル。 */
const CALENDAR_LABELS = {
  today: '今日',
  next: '翌月',
  previous: '前月',
  more: 'その他',
  moreLabel: (count: number) => `+${count}件`,
  selectMonth: '月を選択',
  selectYear: '年を選択',
  month: '月',
  viewSelectLabel: '表示形式',
};

type AvailabilityEventPayload =
  | { kind: 'availability'; date: string; type: Availability['type']; note: string | null }
  | { kind: 'locked'; date: string };

/** シフト管理と同じ月間カレンダー上で、勤務可否の入力状態を表示・操作する。 */
function AvailabilityMonthView({
  month,
  availabilityDates,
  getValue,
  changedDates,
  lockedDates,
  onMonthChange,
  onEditDate,
  onOpenBulk,
}: {
  month: string;
  availabilityDates: ReadonlySet<string>;
  getValue: (date: string) => StagedAvailability | undefined;
  changedDates: ReadonlySet<string>;
  lockedDates: ReadonlySet<string>;
  onMonthChange: (month: string) => void;
  onEditDate: (date: string) => void;
  onOpenBulk: () => void;
}) {
  const today = scheduleToday();
  const maximumMonth = scheduleMaximumDate(today).slice(0, 7);
  // 可否表示と、公開済みシフト日の日付見出しへ重ねるロック表示を同じ MonthView のイベントとして合成する。
  const events = useMemo<ScheduleEventData<AvailabilityEventPayload>[]>(() => {
    const calendarEvents: ScheduleEventData<AvailabilityEventPayload>[] = [];
    for (const date of availabilityDates) {
      if (!date.startsWith(month)) continue;
      const value = getValue(date);
      if (!value) continue;
      calendarEvents.push({
        id: date,
        title: AVAILABILITY_DISPLAY[value.type].title,
        start: `${date} 00:00:00`,
        end: `${addDays(date, 1)} 00:00:00`,
        color: AVAILABILITY_DISPLAY[value.type].color,
        payload: {
          kind: 'availability',
          date,
          type: value.type,
          note: value.note,
        },
      });
    }
    for (const date of lockedDates) {
      if (!date.startsWith(month)) continue;
      calendarEvents.push({
        id: `lock:${date}`,
        title: '公開済みシフト',
        start: `${date} 00:00:00`,
        end: `${addDays(date, 1)} 00:00:00`,
        color: 'gray',
        display: 'background',
        payload: { kind: 'locked', date },
      });
    }
    return calendarEvents;
  }, [availabilityDates, getValue, lockedDates, month]);

  const [year, monthNumber] = month.split('-').map(Number);

  return (
    <Stack gap="xs">
      {/* MonthView 標準ヘッダーには独自ボタンを差し込めないため、同じ部品でヘッダーを組み立てて右端に一括設定を置く。 */}
      <ScheduleHeader labels={CALENDAR_LABELS}>
        <Group gap={4} wrap="nowrap">
          <ScheduleHeader.Previous
            labels={CALENDAR_LABELS}
            onClick={() => onMonthChange(`${addMonths(month, -1)}-01`)}
          />
          <ScheduleHeader.MonthYearSelect
            labels={CALENDAR_LABELS}
            locale="ja"
            endYear={Number(maximumMonth.slice(0, 4))}
            getYearControlProps={(nextYear) => ({
              disabled: `${nextYear}-${String(monthNumber).padStart(2, '0')}` > maximumMonth,
            })}
            getMonthControlProps={(nextMonthIndex) => ({
              disabled: `${year}-${String(nextMonthIndex + 1).padStart(2, '0')}` > maximumMonth,
            })}
            yearValue={year ?? 0}
            monthValue={(monthNumber ?? 1) - 1}
            onYearChange={(nextYear) =>
              onMonthChange(`${nextYear}-${String(monthNumber).padStart(2, '0')}-01`)
            }
            onMonthChange={(nextMonthIndex) =>
              onMonthChange(`${year}-${String(nextMonthIndex + 1).padStart(2, '0')}-01`)
            }
            labelFormat={(date) => `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`}
            monthsListFormat={(date) => `${Number(date.slice(5, 7))}月`}
          />
          <ScheduleHeader.Next
            disabled={month >= maximumMonth}
            labels={CALENDAR_LABELS}
            onClick={() => onMonthChange(`${addMonths(month, 1)}-01`)}
          />
        </Group>
        <AppButton
          intent="secondary"
          size="xs"
          ml="auto"
          className={classes.bulkButton}
          onClick={onOpenBulk}
        >
          一括設定
        </AppButton>
      </ScheduleHeader>
      <MonthView
        date={`${month}-01`}
        withHeader={false}
        onDateChange={onMonthChange}
        events={events}
        locale="ja"
        firstDayOfWeek={1}
        weekdayFormat="dd"
        withOutsideDays={false}
        consistentWeeks
        maxEventsPerDay={1}
        labels={CALENDAR_LABELS}
        getDayProps={(date) => {
          const editability = getDateEditability(date, today, lockedDates);
          const calendarDayColor = getCalendarDayColor(date);
          const disabled = editability !== 'editable';
          const disabledReason =
            editability === 'locked'
              ? '割り当て済みのため変更できません'
              : editability === 'future'
                ? '翌年の同じ月まで入力できます'
                : editability === 'past'
                  ? '過去日は編集できません'
                  : undefined;
          return {
            'data-availability': getValue(date)?.type,
            'data-disabled': disabled || undefined,
            'data-locked': editability === 'locked' || undefined,
            'data-staged': changedDates.has(date) || undefined,
            'aria-label': `${formatDateLabel(date)}${
              editability === 'locked'
                ? '（公開済みシフトのため編集不可）'
                : disabled
                  ? '（編集不可）'
                  : ''
            }`,
            title: disabledReason,
            disabled,
            style: {
              color: disabled
                ? 'var(--mantine-color-dimmed)'
                : calendarDayColor
                  ? `var(--mantine-color-${calendarDayColor}-7)`
                  : undefined,
            },
          };
        }}
        onDayClick={(date) => {
          if (getDateEditability(date, today, lockedDates) === 'editable') onEditDate(date);
        }}
        onEventClick={(event) => {
          const date = event.payload?.date;
          if (
            typeof date === 'string' &&
            event.payload?.kind === 'availability' &&
            getDateEditability(date, today, lockedDates) === 'editable'
          ) {
            onEditDate(date);
          }
        }}
        renderEvent={(event, props) =>
          event.payload?.kind === 'locked' ? (
            <Box style={props.style} className={classes.lockLayer}>
              <IconLock size={15} className={classes.lockIcon} aria-label="公開済みシフト" />
            </Box>
          ) : (
            <UnstyledButton
              {...props}
              className={classes.availabilityEvent}
              aria-label={event.title}
            >
              <Stack gap={0} align="center">
                {event.payload?.kind === 'availability' && (
                  <AvailabilityIcon type={event.payload.type} />
                )}
                {event.payload?.note && (
                  <Tooltip label={event.payload.note} multiline maw={320} withArrow>
                    <IconNote size={14} className={classes.noteIcon} aria-label="メモあり" />
                  </Tooltip>
                )}
              </Stack>
            </UnstyledButton>
          )
        }
        classNames={{
          monthView: classes.monthView,
          monthViewDay: classes.calendarDay,
          monthViewWeekday: classes.calendarWeekday,
        }}
      />
    </Stack>
  );
}
