import { useEffect, useMemo, useState } from 'react';

import {
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { MonthView, type ScheduleEventData } from '@mantine/schedule';
import { IconLock, IconNote } from '@tabler/icons-react';
import { useBlocker } from '@tanstack/react-router';

import 'dayjs/locale/ja';

import { ErrorAlert, InfoAlert } from '@/components/AppAlert';
import { addDays, todayString, toMonth, weekdayIndex } from '@/features/shifts/view-utils';

import {
  buildAvailabilityChanges,
  getDateEditability,
  stageAvailability,
  type StagedAvailability,
} from '../editor';
import { useMyAvailabilities, useUpdateMyAvailabilities } from '../queries';
import type { Availability } from '../schema';
import classes from './AvailabilityCalendar.module.css';

/** 本人が月間カレンダー上で勤務不可・回避希望日をまとめて申告する画面。 */
export function AvailabilityCalendar() {
  const [month, setMonth] = useState(() => todayString().slice(0, 7));
  const availabilityQuery = useMyAvailabilities(month);
  const updateMutation = useUpdateMyAvailabilities();
  const [staged, setStaged] = useState<Map<string, StagedAvailability>>(new Map());
  const [menu, setMenu] = useState<{ date: string; left: number; top: number } | null>(null);
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
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

  useEffect(() => {
    setStaged(new Map());
  }, [month]);

  const getValue = (date: string): StagedAvailability | undefined =>
    staged.get(date) ?? saved.get(date);
  const changeType = (date: string, type: Availability['type'] | null) => {
    const current = getValue(date);
    setStaged((value) =>
      stageAvailability(value, date, type ? { type, note: current?.note ?? null } : null),
    );
  };
  const openNote = (date: string) => {
    setNoteDate(date);
    setNote(getValue(date)?.note ?? '');
  };
  const saveNote = () => {
    if (!noteDate) return;
    const current = getValue(noteDate);
    if (!current) return;
    setStaged((value) =>
      stageAvailability(value, noteDate, { ...current, note: note.trim() || null }),
    );
    setNoteDate(null);
  };
  const save = async () => {
    if (!hasChanges) return;
    await updateMutation.mutateAsync({ changes });
    setStaged(new Map());
  };
  const changeTypeAndCloseMenu = (date: string, type: Availability['type'] | null) => {
    changeType(date, type);
    setMenu(null);
  };
  const openMenu = (date: string, target: HTMLElement) => {
    const { left, bottom } = target.getBoundingClientRect();
    setMenu({ date, left, top: bottom });
  };
  const requestMonthChange = (nextMonth: string) => {
    if (hasChanges) {
      setPendingMonth(nextMonth);
      return;
    }
    setMonth(nextMonth);
  };
  const discardChangesAndChangeMonth = () => {
    if (!pendingMonth) return;
    setStaged(new Map());
    setMonth(pendingMonth);
    setPendingMonth(null);
  };

  return (
    <>
      <Stack gap="md">
        <InfoAlert>
          勤務できる日は指定不要です。勤務不可または、できれば避けたい日だけを選んでください。
        </InfoAlert>
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
            onOpenMenu={openMenu}
          />
        )}
      </Stack>

      <Box pos="sticky" bottom={0} py="md" bg="var(--mantine-color-body)">
        <Stack gap="xs">
          {hasChanges && (
            <Text size="sm" c="orange" ta="center">
              未保存の変更 {changes.length} 件
            </Text>
          )}
          <Button
            fullWidth
            disabled={!hasChanges}
            loading={updateMutation.isPending}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Stack>
      </Box>

      {menu && (
        <Menu opened onChange={(opened) => !opened && setMenu(null)} position="bottom-start">
          <Menu.Target>
            <Box pos="fixed" left={menu.left} top={menu.top} w={1} h={1} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => changeTypeAndCloseMenu(menu.date, 'UNAVAILABLE')}>
              勤務不可にする
            </Menu.Item>
            <Menu.Item onClick={() => changeTypeAndCloseMenu(menu.date, 'AVOID')}>
              できれば避けたい日にする
            </Menu.Item>
            {getValue(menu.date) && (
              <>
                <Menu.Item
                  leftSection={<IconNote size={15} />}
                  onClick={() => {
                    openNote(menu.date);
                    setMenu(null);
                  }}
                >
                  メモを編集
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => changeTypeAndCloseMenu(menu.date, null)}>
                  指定を解除
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
      <Modal opened={noteDate !== null} onClose={() => setNoteDate(null)} title="メモを編集">
        <Stack>
          <Textarea
            label="メモ"
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            maxLength={500}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setNoteDate(null)}>
              キャンセル
            </Button>
            <Button onClick={saveNote}>反映</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={blocker.status === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text>このページを離れると、保存していない変更は失われます。</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => blocker.reset?.()}>
              このページに残る
            </Button>
            <Button color="red" onClick={() => blocker.proceed?.()}>
              破棄して移動
            </Button>
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
            <Button variant="default" onClick={() => setPendingMonth(null)}>
              この月に残る
            </Button>
            <Button color="red" onClick={discardChangesAndChangeMonth}>
              破棄して移動
            </Button>
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
  onOpenMenu,
}: {
  month: string;
  availabilityDates: ReadonlySet<string>;
  getValue: (date: string) => StagedAvailability | undefined;
  changedDates: ReadonlySet<string>;
  lockedDates: ReadonlySet<string>;
  onMonthChange: (month: string) => void;
  onOpenMenu: (date: string, target: HTMLElement) => void;
}) {
  const today = todayString();
  // 可否表示と、割当済み日の日付見出しへ重ねるロック表示を同じ MonthView のイベントとして合成する。
  const events = useMemo<ScheduleEventData<AvailabilityEventPayload>[]>(
    () => [
      ...Array.from(availabilityDates)
        .filter((date) => date.startsWith(month))
        .flatMap((date): ScheduleEventData<AvailabilityEventPayload>[] => {
          const value = getValue(date);
          if (!value) return [];
          return [
            {
              id: date,
              title: value.type === 'UNAVAILABLE' ? '勤務不可' : 'できれば回避',
              start: `${date} 00:00:00`,
              end: `${addDays(date, 1)} 00:00:00`,
              color: value.type === 'UNAVAILABLE' ? 'red' : 'yellow',
              payload: {
                kind: 'availability',
                date,
                type: value.type,
                note: value.note,
              },
            },
          ];
        }),
      ...Array.from(lockedDates)
        .filter((date) => date.startsWith(month))
        .map((date): ScheduleEventData<AvailabilityEventPayload> => ({
          id: `lock:${date}`,
          title: '割当済み',
          start: `${date} 00:00:00`,
          end: `${addDays(date, 1)} 00:00:00`,
          color: 'gray',
          display: 'background',
          payload: { kind: 'locked', date },
        })),
    ],
    [availabilityDates, getValue, lockedDates, month],
  );

  return (
    <MonthView
      date={`${month}-01`}
      onDateChange={onMonthChange}
      events={events}
      locale="ja"
      firstDayOfWeek={1}
      weekdayFormat="dd"
      withOutsideDays={false}
      consistentWeeks
      maxEventsPerDay={2}
      labels={{
        today: '今日',
        next: '翌月',
        previous: '前月',
        more: 'その他',
        moreLabel: (count) => `+${count}件`,
        selectMonth: '月を選択',
        selectYear: '年を選択',
        month: '月',
        viewSelectLabel: '表示形式',
      }}
      monthYearSelectProps={{
        labelFormat: (date) => `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`,
        monthsListFormat: (date) => `${Number(date.slice(5, 7))}月`,
      }}
      viewSelectProps={{ views: ['month'], style: { display: 'none' } }}
      getDayProps={(date) => {
        const editability = getDateEditability(date, today, lockedDates);
        const disabled = editability !== 'editable';
        const disabledReason =
          editability === 'locked'
            ? '割り当て済みのため変更できません'
            : editability === 'past'
              ? '過去日は編集できません'
              : undefined;
        return {
          'data-disabled': disabled || undefined,
          'data-locked': editability === 'locked' || undefined,
          'data-staged': changedDates.has(date) || undefined,
          'aria-label': `${formatDateLabel(date)}${
            editability === 'locked' ? '（割当済みのため編集不可）' : disabled ? '（編集不可）' : ''
          }`,
          title: disabledReason,
          disabled,
          style: {
            color:
              weekdayIndex(date) === 0
                ? 'var(--mantine-color-red-7)'
                : weekdayIndex(date) === 6
                  ? 'var(--mantine-color-blue-7)'
                  : undefined,
          },
        };
      }}
      onDayClick={(date, event) => onOpenMenu(date, event.currentTarget)}
      onEventClick={(event, clickEvent) => {
        const date = event.payload?.date;
        if (
          typeof date === 'string' &&
          event.payload?.kind === 'availability' &&
          getDateEditability(date, today, lockedDates) === 'editable'
        ) {
          onOpenMenu(date, clickEvent.currentTarget);
        }
      }}
      renderEvent={(event, props) =>
        event.payload?.kind === 'locked' ? (
          <Box style={props.style} className={classes.lockLayer}>
            <IconLock size={15} className={classes.lockIcon} aria-label="割当済み" />
          </Box>
        ) : (
          <UnstyledButton {...props} className={classes.availabilityEvent}>
            <Group gap={4} wrap="nowrap">
              <Text
                size="xs"
                fw={600}
                c={event.payload?.type === 'UNAVAILABLE' ? 'red' : 'yellow.8'}
              >
                {event.title}
              </Text>
              {event.payload?.note && <IconNote size={14} />}
            </Group>
          </UnstyledButton>
        )
      }
      classNames={{
        header: classes.calendarHeader,
        monthViewDay: classes.calendarDay,
        monthViewWeekday: classes.calendarWeekday,
      }}
    />
  );
}
