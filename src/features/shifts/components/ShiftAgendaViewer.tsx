import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import {
  Affix,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  Transition,
  UnstyledButton,
} from '@mantine/core';
import { useWindowScroll } from '@mantine/hooks';
import { AgendaView } from '@mantine/schedule';
import type { ScheduleEventData } from '@mantine/schedule';
import { IconUserFilled } from '@tabler/icons-react';

import { ErrorAlert, InfoAlert } from '@/components/AppAlert';
import { useMe } from '@/features/auth/queries';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import { containsInstructorAssignment, filterAgendaDaysByInstructor } from '../aggregators';
import { fetchShiftAgendaPage, useShiftAgendaFuture } from '../queries';
import type { ShiftAgendaDay, ShiftAgendaResponse, ShiftViewItem } from '../schema';
import { addDays, addMonths, shortDateLabel, toMonth } from '../view-utils';
import classes from './ShiftAgendaViewer.module.css';

type ShiftAgendaViewerProps = {
  /** 初回表示の起点日（YYYY-MM-DD） */
  date: string;
  /** 画面上で主に見えている日付の変更通知 */
  onVisibleDateChange: (date: string) => void;
};

/** 稼働日だけを縦に積むシフト表アジェンダ */
export function ShiftAgendaViewer({ date, onVisibleDateChange }: ShiftAgendaViewerProps) {
  const initialDateRef = useRef(date);
  const lastVisibleDateRef = useRef(date);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [pastPages, setPastPages] = useState<ShiftAgendaResponse[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [hasReachedPastEnd, setHasReachedPastEnd] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode | null>(null);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const me = useMe();
  const [scroll, scrollTo] = useWindowScroll();
  const myInstructorId = me.data?.instructorId ?? null;
  const effectiveShowMineOnly = showMineOnly && myInstructorId !== null;
  const future = useShiftAgendaFuture(initialDateRef.current, departmentCode ?? undefined);

  const futureDays = useMemo(
    () => future.data?.pages.flatMap((page) => page.days) ?? [],
    [future.data],
  );
  const pastDays = useMemo(() => pastPages.flatMap((page) => page.days), [pastPages]);
  const days = useMemo(() => mergeAgendaDays([...pastDays, ...futureDays]), [futureDays, pastDays]);
  const filteredDays = useMemo(
    () => (effectiveShowMineOnly ? filterAgendaDaysByInstructor(days, myInstructorId) : days),
    [days, effectiveShowMineOnly, myInstructorId],
  );
  const firstDate = days[0]?.date ?? initialDateRef.current;

  useEffect(() => {
    setPastPages([]);
    setPastError(null);
    setHasReachedPastEnd(false);
  }, [departmentCode]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && future.hasNextPage && !future.isFetchingNextPage) {
        void future.fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [future]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-agenda-date]'));
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextDate = visible?.target.getAttribute('data-agenda-date');
        if (nextDate && nextDate !== lastVisibleDateRef.current) {
          lastVisibleDateRef.current = nextDate;
          onVisibleDateChange(nextDate);
        }
      },
      { threshold: [0.35, 0.7] },
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [filteredDays, onVisibleDateChange]);

  const loadPast = async () => {
    setIsLoadingPast(true);
    setPastError(null);
    try {
      const page = await fetchShiftAgendaPage({
        cursor: firstDate,
        direction: 'past',
        limit: 7,
        ...(departmentCode ? { departmentCode } : {}),
      });
      if (page.days.length === 0 || page.pageInfo.previousCursor === null) {
        setHasReachedPastEnd(true);
        return;
      }
      setPastPages((current) => [page, ...current]);
    } catch (err) {
      setPastError(err instanceof Error ? err.message : '過去のアジェンダ取得に失敗しました');
    } finally {
      setIsLoadingPast(false);
    }
  };

  return (
    <>
      <Stack gap="md">
        <Title order={2}>シフト表</Title>

        <Group align="flex-end" gap="sm">
          <Select
            label="部門"
            data={[
              { value: 'all', label: 'すべて' },
              ...departmentCodeSchema.options.map((code) => ({
                value: code,
                label: getDepartmentAppearance(code).label,
              })),
            ]}
            value={departmentCode ?? 'all'}
            onChange={(value) => {
              const parsed = departmentCodeSchema.safeParse(value);
              setDepartmentCode(parsed.success ? parsed.data : null);
            }}
            allowDeselect={false}
            size="sm"
            w={{ base: '100%', sm: 220 }}
          />
          <Switch
            label="自分だけ"
            checked={effectiveShowMineOnly}
            disabled={!myInstructorId}
            onChange={(event) => setShowMineOnly(event.currentTarget.checked)}
          />
        </Group>

        <Button
          type="button"
          variant="outline"
          color="gray"
          size="sm"
          onClick={() => void loadPast()}
          loading={isLoadingPast}
          disabled={hasReachedPastEnd}
        >
          以前を表示
        </Button>

        {pastError && <ErrorAlert>{pastError}</ErrorAlert>}
        {hasReachedPastEnd && <InfoAlert>これ以上遡れるシフトはありません。</InfoAlert>}
        {future.isLoading && (
          <Text c="dimmed" size="sm">
            読み込み中...
          </Text>
        )}
        {future.isError && (
          <ErrorAlert>{future.error?.message ?? 'アジェンダの取得に失敗しました'}</ErrorAlert>
        )}

        {filteredDays.length === 0 && !future.isLoading && (
          <Text c="dimmed" size="sm">
            {effectiveShowMineOnly ? '自分の勤務はありません。' : '表示できるシフトはありません。'}
          </Text>
        )}

        <AgendaDayList days={filteredDays} myInstructorId={myInstructorId} />

        <Box ref={sentinelRef} mih={1} />
        {future.isFetchingNextPage && (
          <Text c="dimmed" size="sm" ta="center">
            続きを読み込み中...
          </Text>
        )}
      </Stack>

      <Affix position={{ bottom: 20, right: 20 }}>
        <Transition transition="slide-up" mounted={scroll.y > 240}>
          {(transitionStyles) => (
            <Button
              type="button"
              variant="default"
              color="gray"
              size="xs"
              radius="xl"
              style={transitionStyles}
              onClick={() => scrollTo({ y: 0 })}
            >
              ↑ 上へ戻る
            </Button>
          )}
        </Transition>
      </Affix>
    </>
  );
}

/** シフトイベントに付随するペイロード（AgendaView は payload を汎用型で扱うため renderEvent 内で参照する） */
type ShiftEventPayload = {
  shift: ShiftViewItem;
  includesMe: boolean;
};

/** 稼働日を月ごとにグルーピングする（月が変わったことを識別しやすくするため、月ごとに 1つの AgendaView を描画する） */
function groupDaysByMonth(days: ShiftAgendaDay[]): Map<string, ShiftAgendaDay[]> {
  const byMonth = new Map<string, ShiftAgendaDay[]>();
  for (const day of days) {
    const month = toMonth(day.date);
    const list = byMonth.get(month);
    if (list) {
      list.push(day);
    } else {
      byMonth.set(month, [day]);
    }
  }
  return byMonth;
}

/** 月文字列（YYYY-MM）の月末日（YYYY-MM-DD）を返す */
function lastDateOfMonth(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/**
 * 稼働日配列を AgendaView 用の終日イベント配列へ変換する。
 * シフトは時刻を持たないため、当日 0時〜翌日 0時の終日イベントとして表現する。
 */
function buildMonthEvents(
  days: ShiftAgendaDay[],
  myInstructorId: string | null,
): ScheduleEventData<ShiftEventPayload>[] {
  const events: ScheduleEventData<ShiftEventPayload>[] = [];
  for (const day of days) {
    for (const shift of day.shifts) {
      events.push({
        id: shift.id,
        title: shift.shiftType.name,
        start: `${shift.date} 00:00:00`,
        end: `${addDays(shift.date, 1)} 00:00:00`,
        // AgendaView の左端バーで部門を判別できるよう、部門固有の色を使う。
        color: getDepartmentAppearance(shift.department.code, shift.department.name).color,
        payload: {
          shift,
          includesMe: containsInstructorAssignment(shift, myInstructorId),
        },
      });
    }
  }
  return events;
}

function AgendaDayList({
  days,
  myInstructorId,
}: {
  days: ShiftAgendaDay[];
  myInstructorId: string | null;
}) {
  const monthGroups = groupDaysByMonth(days);

  return (
    <Stack gap="sm">
      {Array.from(monthGroups, ([month, monthDays]) => (
        <Fragment key={month}>
          <MonthHeader month={month} />
          <AgendaView
            rangeStart={`${month}-01`}
            rangeEnd={lastDateOfMonth(month)}
            events={buildMonthEvents(monthDays, myInstructorId)}
            mode="static"
            dateHeaderFormat={(date) => shortDateLabel(date.slice(0, 10))}
            styles={{ agendaViewHeader: { display: 'none' } }}
            renderEvent={(event, props) => {
              // AgendaView の payload は汎用型のため、ここで自前の型へ絞り込む
              // （events はこのコンポーネント自身が組み立てているため安全）
              const payload = event.payload as ShiftEventPayload;
              return (
                <UnstyledButton
                  {...props}
                  data-agenda-date={payload.shift.date}
                  display="block"
                  w="100%"
                >
                  <Box
                    className={classes.eventBody}
                    data-includes-me={payload.includesMe || undefined}
                  >
                    <Box
                      className={classes.departmentBar}
                      bg={
                        getDepartmentAppearance(
                          payload.shift.department.code,
                          payload.shift.department.name,
                        ).color
                      }
                    />
                    <ShiftAgendaContent shift={payload.shift} myInstructorId={myInstructorId} />
                  </Box>
                </UnstyledButton>
              );
            }}
          />
        </Fragment>
      ))}
    </Stack>
  );
}

function MonthHeader({ month }: { month: string }) {
  return (
    <Text fw={700} size="sm" className={classes.monthHeader}>
      {month.replace('-', '年')}月
    </Text>
  );
}

function ShiftAgendaContent({
  shift,
  myInstructorId,
}: {
  shift: ShiftViewItem;
  myInstructorId: string | null;
}) {
  const department = getDepartmentAppearance(shift.department.code, shift.department.name);
  const DepartmentIcon = department.icon;

  return (
    <Stack gap={4} className={classes.eventDetails}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <ThemeIcon color={department.color} variant="transparent" size="sm">
            <DepartmentIcon size={18} stroke={1.75} />
          </ThemeIcon>
          <Text fw={600}>{shift.shiftType.name}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {shift.assignedInstructors.length}名
        </Text>
      </Group>
      {shift.assignedInstructors.length > 0 ? (
        <Group gap={4} align="flex-start" wrap="nowrap">
          <ThemeIcon color="gray" variant="transparent" size={16} mt={3}>
            <IconUserFilled size={14} />
          </ThemeIcon>
          <Text size="sm" className={classes.assignedInstructorList}>
          {shift.assignedInstructors.map((instructor) => (
            <Fragment key={instructor.id}>
              <Text component="span" fw={instructor.id === myInstructorId ? 600 : 400}>
                {instructor.displayName}
              </Text>
              {instructor.id !== shift.assignedInstructors.at(-1)?.id && ' ・ '}
            </Fragment>
          ))}
          </Text>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          未割り当て
        </Text>
      )}
    </Stack>
  );
}

function mergeAgendaDays(days: ShiftAgendaDay[]): ShiftAgendaDay[] {
  const byDate = new Map<string, ShiftAgendaDay>();
  for (const day of days) {
    if (!byDate.has(day.date)) {
      byDate.set(day.date, day);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
