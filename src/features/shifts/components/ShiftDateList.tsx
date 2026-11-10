import { useId } from 'react';

import { Box, Group, Stack, Text, UnstyledButton } from '@mantine/core';

import { AppBadge } from '@/components/AppBadge';
import type { Availability } from '@/features/availabilities/schema';

import { getCalendarDayColor, shortDateLabel } from '../view-utils';
import { AssignedAvailabilityIcon } from './AssignedAvailabilityIcon';
import { availabilityDisplay } from './availability-display';
import type { DayAssignments, HeaderEventPayload } from './calendar-events';
import classes from './ShiftManager.module.css';
import { staffingBackground, staffingRate } from './staffing-appearance';

type ShiftDateListProps = {
  days: string[];
  assignmentsByDay: DayAssignments;
  availabilityByPersonDay: ReadonlyMap<string, Availability> | undefined;
  availabilityFailed: boolean;
  headersByDay: ReadonlyMap<string, HeaderEventPayload>;
  requirementsReady: boolean;
  requiredByDay: ReadonlyMap<string, number | null> | null;
  selectedDate: string | null;
  focusedInstructorId: string | null;
  myInstructorId: string | null;
  autoAssignMode: boolean;
  autoAssignDates: ReadonlySet<string>;
  isDateDisabled: (date: string) => boolean;
  onSelectDate: (date: string) => void;
};

const staffingLabels = {
  FILLED: '充足',
  OVER: '過員',
  SHORT: '不足',
  UNSET: '必要人数未設定',
  NOT_PLANNED: '開講予定なし',
};

/** モバイルの月間配置を日付順に表示し、配置者名を折り返して読めるようにする。 */
export function ShiftDateList({
  days,
  assignmentsByDay,
  availabilityByPersonDay,
  availabilityFailed,
  headersByDay,
  requirementsReady,
  requiredByDay,
  selectedDate,
  focusedInstructorId,
  myInstructorId,
  autoAssignMode,
  autoAssignDates,
  isDateDisabled,
  onSelectDate,
}: ShiftDateListProps) {
  const descriptionId = useId();

  return (
    <Stack gap={0} className={classes.dateList} role="group" aria-label="月の配置日付リスト">
      {days.map((date) => {
        const assigned = assignmentsByDay.get(date) ?? [];
        const header = headersByDay.get(date);
        const staffing = header?.staffing;
        const required = requiredByDay?.get(date) ?? null;
        const rate = staffingRate(required, assigned.length);
        const selected = autoAssignMode ? autoAssignDates.has(date) : selectedDate === date;
        const focused = assigned.some((person) => person.id === focusedInstructorId);

        return (
          <UnstyledButton
            key={date}
            className={classes.dateListDay}
            data-shift-list-date={date}
            title={assigned
              .map(
                (person) =>
                  `${person.name}：${availabilityDisplay(availabilityByPersonDay?.get(`${person.id}:${date}`), availabilityByPersonDay !== undefined, availabilityFailed).label}`,
              )
              .join(' / ')}
            style={{ backgroundColor: staffingBackground(required, assigned.length) }}
            data-published={header?.status === 'PUBLISHED' || undefined}
            data-selected={selected || undefined}
            data-focused-instructor={focused || undefined}
            disabled={isDateDisabled(date)}
            aria-label={`${shortDateLabel(date)}${autoAssignMode ? 'を自動割当の対象として切り替え' : 'の割り当てを編集'}`}
            aria-describedby={`${descriptionId}-${date}`}
            aria-pressed={selected}
            onClick={() => onSelectDate(date)}
          >
            <Text component="span" size="sm" fw={600} c={getCalendarDayColor(date) ?? 'inherit'}>
              {shortDateLabel(date)}
            </Text>
            <Stack gap={5} miw={0} id={`${descriptionId}-${date}`}>
              <Group gap="xs" wrap="wrap">
                <Text
                  component="span"
                  size="xs"
                  c={
                    staffing?.icon === 'warning' || staffing?.icon === 'over'
                      ? 'yellow.8'
                      : 'dimmed'
                  }
                >
                  {staffing
                    ? `${staffing.text} ${staffingLabels[staffing.status]}${staffing.status !== 'SHORT' && staffing.icon === 'warning' ? '・資格構成の確認が必要' : ''}`
                    : requirementsReady
                      ? '必要人数未設定'
                      : '必要人数を読み込み中…'}
                </Text>
                {rate !== null && (
                  <Text component="span" size="xs">
                    充足率 {Math.round(rate)}%
                  </Text>
                )}
                {header?.status && (
                  <Text component="span" size="xs" fw={600} c="dimmed">
                    {header.status === 'PUBLISHED' ? '公開済み' : '下書き'}
                  </Text>
                )}
                {header?.staged && (
                  <AppBadge kind="pending" size="xs">
                    未保存
                  </AppBadge>
                )}
              </Group>
              <Box className={classes.dateListNames}>
                {assigned.length === 0 ? (
                  <Text component="span" size="sm" c="dimmed">
                    未配置
                  </Text>
                ) : (
                  assigned.map((person) => (
                    <Text
                      key={person.id}
                      component="span"
                      size="sm"
                      fw={person.id === myInstructorId ? 600 : 400}
                      className={classes.dateListName}
                      data-focused={person.id === focusedInstructorId || undefined}
                      data-dimmed={
                        (focusedInstructorId !== null && person.id !== focusedInstructorId) ||
                        undefined
                      }
                    >
                      <span className={classes.dateListNameText}>{person.name}</span>{' '}
                      <AssignedAvailabilityIcon
                        availability={availabilityByPersonDay?.get(`${person.id}:${date}`)}
                        ready={availabilityByPersonDay !== undefined}
                        failed={availabilityFailed}
                      />
                    </Text>
                  ))
                )}
              </Box>
              {header?.description && (
                <Text component="span" size="xs" c="dimmed" lineClamp={2}>
                  備考：{header.description}
                </Text>
              )}
            </Stack>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
