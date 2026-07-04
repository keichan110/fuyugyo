import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';

import { fetchShiftAgendaPage, useShiftAgendaFuture } from '../queries';
import type { ShiftAgendaDay, ShiftAgendaResponse, ShiftViewItem } from '../schema';
import { shortDateLabel, toMonth } from '../view-utils';

type ShiftAgendaViewerProps = {
  /** 初回表示の起点日（YYYY-MM-DD） */
  date: string;
  /** 画面上で主に見えている日付の変更通知 */
  onVisibleDateChange: (date: string) => void;
};

/** 稼働日だけを縦に積むシフト確認アジェンダ */
export function ShiftAgendaViewer({ date, onVisibleDateChange }: ShiftAgendaViewerProps) {
  const initialDateRef = useRef(date);
  const lastVisibleDateRef = useRef(date);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visibleDate, setVisibleDate] = useState(date);
  const [pastPages, setPastPages] = useState<ShiftAgendaResponse[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const future = useShiftAgendaFuture(initialDateRef.current);

  const futureDays = useMemo(
    () => future.data?.pages.flatMap((page) => page.days) ?? [],
    [future.data],
  );
  const pastDays = useMemo(() => pastPages.flatMap((page) => page.days), [pastPages]);
  const days = useMemo(() => mergeAgendaDays([...pastDays, ...futureDays]), [futureDays, pastDays]);
  const firstDate = days[0]?.date ?? initialDateRef.current;

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
          setVisibleDate(nextDate);
          onVisibleDateChange(nextDate);
        }
      },
      { threshold: [0.35, 0.7] },
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [days, onVisibleDateChange]);

  const loadPast = async () => {
    setIsLoadingPast(true);
    setPastError(null);
    try {
      const page = await fetchShiftAgendaPage({
        cursor: firstDate,
        direction: 'past',
        limit: 7,
      });
      setPastPages((current) => [page, ...current]);
    } catch (err) {
      setPastError(err instanceof Error ? err.message : '過去のアジェンダ取得に失敗しました');
    } finally {
      setIsLoadingPast(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>シフト確認</Title>
        <Badge variant="light" color="blue">
          {toMonth(visibleDate).replace('-', '年')}月
        </Badge>
      </Group>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void loadPast()}
        loading={isLoadingPast}
      >
        以前を表示
      </Button>

      {pastError && <Alert color="red">{pastError}</Alert>}
      {future.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中...
        </Text>
      )}
      {future.isError && (
        <Alert color="red">{future.error?.message ?? 'アジェンダの取得に失敗しました'}</Alert>
      )}

      {days.length === 0 && !future.isLoading && (
        <Text c="dimmed" size="sm">
          表示できるシフトはありません。
        </Text>
      )}

      <AgendaDayList days={days} />

      <div ref={sentinelRef} style={{ minHeight: 1 }} />
      {future.isFetchingNextPage && (
        <Text c="dimmed" size="sm" ta="center">
          続きを読み込み中...
        </Text>
      )}
    </Stack>
  );
}

function AgendaDayList({ days }: { days: ShiftAgendaDay[] }) {
  let currentMonth = '';

  return (
    <Stack gap="sm">
      {days.map((day) => {
        const month = toMonth(day.date);
        const showMonth = month !== currentMonth;
        currentMonth = month;

        return (
          <Fragment key={day.date}>
            {showMonth && <MonthHeader month={month} />}
            <Stack gap="xs" data-agenda-date={day.date}>
              <Group justify="space-between" align="baseline">
                <Text fw={700}>{shortDateLabel(day.date)}</Text>
                <Text size="xs" c="dimmed">
                  {day.shifts.length}枠
                </Text>
              </Group>
              <Stack gap="xs">
                {day.shifts.map((shift) => (
                  <ShiftAgendaCard key={shift.id} shift={shift} />
                ))}
              </Stack>
            </Stack>
          </Fragment>
        );
      })}
    </Stack>
  );
}

function MonthHeader({ month }: { month: string }) {
  return (
    <Text
      fw={700}
      size="sm"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        background: 'var(--mantine-color-body)',
        paddingBlock: '8px',
      }}
    >
      {month.replace('-', '年')}月
    </Text>
  );
}

function ShiftAgendaCard({ shift }: { shift: ShiftViewItem }) {
  return (
    <Card withBorder padding="sm" radius="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={600}>{shift.shiftType.name}</Text>
            <Text size="sm" c="dimmed">
              {shift.department.name}
            </Text>
          </Stack>
          <Badge variant="light" color={shift.assignedInstructors.length > 0 ? 'green' : 'gray'}>
            {shift.assignedInstructors.length}名
          </Badge>
        </Group>
        {shift.assignedInstructors.length > 0 ? (
          <Group gap={6}>
            {shift.assignedInstructors.map((instructor) => (
              <Badge key={instructor.id} variant="outline" color="gray">
                {instructor.displayName}
              </Badge>
            ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            未割り当て
          </Text>
        )}
        {shift.description && (
          <Text size="sm" c="dimmed">
            {shift.description}
          </Text>
        )}
      </Stack>
    </Card>
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
