import { useEffect, useMemo, useState } from 'react';

import {
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconNote } from '@tabler/icons-react';
import { useBlocker } from '@tanstack/react-router';

import { ErrorAlert, InfoAlert } from '@/components/AppAlert';
import {
  addDays,
  addMonths,
  parseDate,
  todayString,
  weekdayIndex,
} from '@/features/shifts/view-utils';

import {
  buildAvailabilityChanges,
  getDateEditability,
  stageAvailability,
  type StagedAvailability,
} from '../editor';
import { useMyAvailabilities, useUpdateMyAvailabilities } from '../queries';
import type { Availability } from '../schema';
import classes from './AvailabilityCalendar.module.css';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

/** 本人が月間カレンダー上で勤務不可・回避希望日をまとめて申告する画面。 */
export function AvailabilityCalendar() {
  const [month, setMonth] = useState(() => todayString().slice(0, 7));
  const availabilityQuery = useMyAvailabilities(month);
  const updateMutation = useUpdateMyAvailabilities();
  const [staged, setStaged] = useState<Map<string, StagedAvailability>>(new Map());
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
        <Group justify="space-between">
          <Button
            variant="subtle"
            aria-label="前の月"
            onClick={() => requestMonthChange(addMonths(month, -1))}
          >
            <IconChevronLeft size={18} />
          </Button>
          <Text fw={700} size="lg">
            {formatMonth(month)}
          </Text>
          <Button
            variant="subtle"
            aria-label="次の月"
            onClick={() => requestMonthChange(addMonths(month, 1))}
          >
            <IconChevronRight size={18} />
          </Button>
        </Group>

        <InfoAlert>
          勤務できる日は指定不要です。勤務不可または、できれば避けたい日だけを選んでください。
        </InfoAlert>
        {availabilityQuery.isError && <ErrorAlert>{availabilityQuery.error.message}</ErrorAlert>}
        {updateMutation.isError && <ErrorAlert>{updateMutation.error.message}</ErrorAlert>}
        {availabilityQuery.isLoading ? (
          <Text c="dimmed">読み込み中...</Text>
        ) : (
          <CalendarGrid
            month={month}
            getValue={getValue}
            lockedDates={lockedDates}
            onTypeChange={changeType}
            onNote={openNote}
          />
        )}
      </Stack>

      <Box pos="sticky" bottom={0} py="md" bg="var(--mantine-color-body)">
        <Button
          fullWidth
          disabled={!hasChanges}
          loading={updateMutation.isPending}
          onClick={() => void save()}
        >
          {hasChanges ? `${changes.length}件の変更を保存` : '変更はありません'}
        </Button>
      </Box>

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

/** 月間カレンダーの各セルで申告種別・メモを操作させる。 */
function CalendarGrid({
  month,
  getValue,
  lockedDates,
  onTypeChange,
  onNote,
}: {
  month: string;
  getValue: (date: string) => StagedAvailability | undefined;
  lockedDates: ReadonlySet<string>;
  onTypeChange: (date: string, type: Availability['type'] | null) => void;
  onNote: (date: string) => void;
}) {
  const dates = calendarDates(month);
  const today = todayString();
  return (
    <table className={classes.calendar}>
      <thead>
        <tr>
          {WEEKDAYS.map((day) => (
            <th key={day}>{day}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: dates.length / 7 }, (_, week) => (
          <tr key={week}>
            {dates.slice(week * 7, week * 7 + 7).map((date) => {
              const editability = getDateEditability(date, today, lockedDates);
              const value = getValue(date);
              const outsideMonth = !date.startsWith(month);
              const disabled = outsideMonth || editability !== 'editable';
              const reason = outsideMonth
                ? '表示中の月の日付だけ編集できます'
                : editability === 'locked'
                  ? '管理者が割当を外せば再び編集できます'
                  : '過去日は編集できません';
              const cell = (
                <UnstyledButton className={classes.calendarButton} disabled={disabled}>
                  <Stack gap={4}>
                    <Text size="sm">{Number(date.slice(8))}</Text>
                    {value && (
                      <Badge size="sm" color={value.type === 'UNAVAILABLE' ? 'red' : 'yellow'}>
                        {value.type === 'UNAVAILABLE' ? '勤務不可' : 'できれば回避'}
                      </Badge>
                    )}
                    {value?.note && <IconNote size={15} />}
                  </Stack>
                </UnstyledButton>
              );
              return (
                <td key={date}>
                  {disabled ? (
                    <Tooltip label={reason} withArrow>
                      <Box component="span" display="block">
                        {cell}
                      </Box>
                    </Tooltip>
                  ) : (
                    <Menu position="bottom-start" shadow="md">
                      <Menu.Target>{cell}</Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => onTypeChange(date, 'UNAVAILABLE')}>
                          勤務不可にする
                        </Menu.Item>
                        <Menu.Item onClick={() => onTypeChange(date, 'AVOID')}>
                          できれば避けたい日にする
                        </Menu.Item>
                        {value && (
                          <>
                            <Menu.Item
                              leftSection={<IconNote size={15} />}
                              onClick={() => onNote(date)}
                            >
                              メモを編集
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" onClick={() => onTypeChange(date, null)}>
                              指定を解除
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 月曜始まりで、当月全日を含むカレンダー用日付列を返す。
 * 月初の曜日を月曜基準へ補正し、月末後の日数も足して週が途切れない行数へ丸める。
 */
function calendarDates(month: string): string[] {
  const first = `${month}-01`;
  const mondayOffset = (weekdayIndex(first) + 6) % 7;
  const start = addDays(first, -mondayOffset);
  const nextMonth = addMonths(month, 1);
  const last = addDays(`${nextMonth}-01`, -1);
  const trailing = (7 - ((weekdayIndex(last) + 6) % 7) - 1) % 7;
  const days = Math.ceil((mondayOffset + Number(last.slice(8)) + trailing) / 7) * 7;
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

/** YYYY-MM を日本語の月見出しへ整形する。 */
function formatMonth(month: string): string {
  const date = parseDate(`${month}-01`);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
}
