import { useMemo } from 'react';

import { Card, Group, Text } from '@mantine/core';
import { MonthView, type ScheduleEventData } from '@mantine/schedule';

import 'dayjs/locale/ja';

import { AppButton } from '@/components/AppButton';
import type { Availability } from '@/features/availabilities/schema';

import type { FrameComposition } from '../qualification-composition';
import type { AutoAssignProposal, ShiftViewItem } from '../schema';
import { getCalendarDayColor } from '../view-utils';
import { AutoAssignToolbar } from './AutoAssignToolbar';
import {
  buildCalendarEvents,
  isHeaderEventPayload,
  type AssignmentEventPayload,
  type DayAssignments,
  type HeaderEventPayload,
} from './calendar-events';
import { CalendarAssignmentEvent } from './CalendarAssignmentEvent';
import type { StagedRequirements } from './requirement-stage';
import type { SelectedCell, StagedCell } from './shift-manager-types';
import { cellKey, weekdayLabel } from './shift-manager-utils';
import { ShiftCalendarHeader } from './ShiftCalendarHeader';
import { ShiftDateList } from './ShiftDateList';
import classes from './ShiftManager.module.css';
import { staffingBackground, staffingRate } from './staffing-appearance';
import { useCalendarAvailability } from './useCalendarAvailability';

type ShiftCalendarProps = {
  publicationControls: React.ReactNode;
  differenceControl: React.ReactNode;
  month: string;
  onMonthChange: (month: string) => void;
  days: string[];
  activeShiftTypeId: string;
  shiftByCell: Map<string, ShiftViewItem>;
  assignmentsByDay: DayAssignments;
  availabilities: Availability[] | undefined;
  availabilityFailed: boolean;
  focusedInstructor: { id: string; name: string } | null;
  onClearInstructor: () => void;
  stagedCells: Map<string, StagedCell>;
  selectedCell: SelectedCell | null;
  myInstructorId: string | null;
  onSelectCell: (cell: SelectedCell) => void;
  onDeselect: () => void;
  autoAssignMode: boolean;
  autoAssignDates: Set<string>;
  onStartAutoAssign: () => void;
  onCancelAutoAssign: () => void;
  onToggleAutoAssignDate: (date: string) => void;
  onRunAutoAssign: () => void;
  isAutoAssigning: boolean;
  /** 自動割当に必要なデータが揃い、開いている種別に必要資格がある */
  canRunAutoAssign: boolean;
  missingCertification: boolean;
  /** 必要人数の取得後に、選べる日が1日もない */
  noSelectableDates: boolean;
  shortageByCell: Map<string, AutoAssignProposal['shortage']>;
  /** 日 → 資格構成の評価。自動割当コンテキストの取得前は null。 */
  compositionByDay: ReadonlyMap<string, FrameComposition> | null;
  stagedRequirements: StagedRequirements;
  /** 日 → 表示用の必要人数。必要人数の取得前は null（未設定と区別して何も出さない）。 */
  requiredByDay: Map<string, number | null> | null;
  isAutoAssignSelectableDate: (date: string) => boolean;
  onOpenBulkModal: () => void;
};

/** 選択中の部門・種別の月間配置を、PCではカレンダー、モバイルでは日付リストで表示する。 */
export function ShiftCalendar({
  publicationControls,
  differenceControl,
  month,
  onMonthChange,
  days,
  activeShiftTypeId,
  shiftByCell,
  assignmentsByDay,
  availabilities,
  availabilityFailed,
  focusedInstructor,
  onClearInstructor,
  stagedCells,
  selectedCell,
  myInstructorId,
  onSelectCell,
  onDeselect,
  autoAssignMode,
  autoAssignDates,
  onStartAutoAssign,
  onCancelAutoAssign,
  onToggleAutoAssignDate,
  onRunAutoAssign,
  isAutoAssigning,
  canRunAutoAssign,
  missingCertification,
  noSelectableDates,
  shortageByCell,
  compositionByDay,
  stagedRequirements,
  requiredByDay,
  isAutoAssignSelectableDate,
  onOpenBulkModal,
}: ShiftCalendarProps) {
  const { availabilityByPersonDay, describeDayAvailability } = useCalendarAvailability(
    availabilities,
    availabilityFailed,
    assignmentsByDay,
  );
  const focusedInstructorId = focusedInstructor?.id ?? null;
  const events = useMemo<ScheduleEventData<AssignmentEventPayload>[]>(
    () =>
      buildCalendarEvents({
        days,
        shiftTypeId: activeShiftTypeId,
        assignmentsByDay,
        shiftByCell,
        stagedCells,
        stagedRequirements,
        requiredByDay,
        shortageByCell,
        compositionByDay,
      }),
    [
      activeShiftTypeId,
      assignmentsByDay,
      compositionByDay,
      days,
      requiredByDay,
      shiftByCell,
      shortageByCell,
      stagedCells,
      stagedRequirements,
    ],
  );

  const headersByDay = useMemo(() => {
    const headers = new Map<string, HeaderEventPayload>();
    for (const event of events) {
      if (isHeaderEventPayload(event.payload)) headers.set(event.payload.date, event.payload);
    }
    return headers;
  }, [events]);
  const isDateDisabled = (date: string) =>
    autoAssignMode && (isAutoAssigning || !isAutoAssignSelectableDate(date));

  // 日・イベント共通のクリック処理。自動割当モードでは対象日の切り替えだけを行う。
  const handleDateClick = (date: string) => {
    if (isAutoAssigning) return;
    if (!date.startsWith(`${month}-`)) {
      if (!autoAssignMode) onDeselect();
      return;
    }
    if (autoAssignMode) {
      // 必要人数が1名以上の日だけ選択できる（未設定と0名は対象外）
      if (isAutoAssignSelectableDate(date)) onToggleAutoAssignDate(date);
      return;
    }
    onSelectCell({ date, shiftTypeId: activeShiftTypeId });
  };

  // 背景イベント（ヘッダー層）は MonthView の行数に数えられないため、担当者数だけで決める
  const maxEventsPerDay = Math.min(
    10,
    Math.max(2, ...Array.from(assignmentsByDay.values(), (assigned) => assigned.length)),
  );

  return (
    <Card padding="sm" withBorder className={classes.calendarPanel}>
      <AutoAssignToolbar
        publicationControls={publicationControls}
        differenceControl={differenceControl}
        autoAssignMode={autoAssignMode}
        selectedDateCount={autoAssignDates.size}
        requirementsReady={!!requiredByDay}
        noSelectableDates={noSelectableDates}
        canRunAutoAssign={canRunAutoAssign}
        missingCertification={missingCertification}
        isAutoAssigning={isAutoAssigning}
        hasPreviousProposal={shortageByCell.size > 0}
        onStartAutoAssign={onStartAutoAssign}
        onCancelAutoAssign={onCancelAutoAssign}
        onRunAutoAssign={onRunAutoAssign}
        onOpenBulkModal={onOpenBulkModal}
      />

      {focusedInstructor && (
        <Group gap="xs" mb="xs" wrap="wrap">
          <Text size="xs" c="blue">
            {focusedInstructor.name}の配置日を強調中
          </Text>
          <AppButton intent="tertiary" size="compact-xs" onClick={onClearInstructor}>
            解除
          </AppButton>
        </Group>
      )}
      <ShiftCalendarHeader month={month} disabled={isAutoAssigning} onMonthChange={onMonthChange} />
      <MonthView
        withHeader={false}
        className={classes.monthView}
        date={`${month}-01`}
        onDateChange={onMonthChange}
        events={events}
        locale="ja"
        firstDayOfWeek={1}
        weekdayFormat="dd"
        withOutsideDays
        consistentWeeks
        maxEventsPerDay={maxEventsPerDay}
        moreEventsProps={{ className: classes.moreEvents, tabIndex: -1 }}
        labels={{
          today: '今日',
          next: '翌月',
          previous: '前月',
          more: 'その他',
          moreLabel: (count) => `+${count}名`,
          selectMonth: '月を選択',
          selectYear: '年を選択',
          month: '月',
          viewSelectLabel: '表示形式',
        }}
        getDayProps={(date) => {
          const outside = !date.startsWith(`${month}-`);
          const required = requiredByDay?.get(date) ?? null;
          const assigned = assignmentsByDay.get(date)?.length ?? 0;
          const rate = staffingRate(required, assigned);
          const selected =
            selectedCell?.date === date && selectedCell.shiftTypeId === activeShiftTypeId;
          const calendarDayColor = getCalendarDayColor(date);
          return {
            'data-shift-date': date,
            'data-published':
              shiftByCell.get(cellKey(date, activeShiftTypeId))?.status === 'PUBLISHED' ||
              undefined,
            'data-focused-instructor':
              (focusedInstructorId !== null &&
                assignmentsByDay.get(date)?.some((person) => person.id === focusedInstructorId)) ||
              undefined,
            // 自動割当モードでは、対象にできない日（未設定・0名）をクリック・キー操作から外す
            disabled:
              (outside ? autoAssignMode || isAutoAssigning : isDateDisabled(date)) || undefined,
            'data-selected': selected || undefined,
            'data-staged':
              stagedCells.has(cellKey(date, activeShiftTypeId)) ||
              stagedRequirements.has(cellKey(date, activeShiftTypeId)) ||
              undefined,
            'aria-label': outside
              ? '対象月外。日付の選択を解除'
              : `${rate !== null ? `充足率${Math.round(rate)}%。` : ''}${shiftByCell.get(cellKey(date, activeShiftTypeId))?.status === 'PUBLISHED' ? '公開済み。自動割当の対象外。' : '未公開。'}${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekdayLabel(date)}）の割り当てを編集`,
            title: outside
              ? '選択を解除'
              : rate !== null
                ? `充足率 ${Math.round(rate)}%（配置${assigned} / 必要${required}名） ${describeDayAvailability(date)}`
                : describeDayAvailability(date) || undefined,
            style: {
              color: outside
                ? 'var(--mantine-color-gray-6)'
                : calendarDayColor
                  ? `var(--mantine-color-${calendarDayColor}-7)`
                  : undefined,
              backgroundColor:
                autoAssignMode && autoAssignDates.has(date)
                  ? 'var(--mantine-color-blue-0)'
                  : outside
                    ? 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))'
                    : staffingBackground(required, assigned),
              outline:
                autoAssignMode && autoAssignDates.has(date)
                  ? '2px solid var(--mantine-color-blue-5)'
                  : undefined,
            },
          };
        }}
        onDayClick={handleDateClick}
        renderEvent={(event, props) => {
          return (
            <CalendarAssignmentEvent
              event={event}
              style={props.style}
              focusedInstructorId={focusedInstructorId}
              myInstructorId={myInstructorId}
              availabilityByPersonDay={availabilityByPersonDay}
              availabilityFailed={availabilityFailed}
            />
          );
        }}
        classNames={{
          monthViewDay: classes.calendarDay,
          monthViewWeekday: classes.calendarWeekday,
          monthViewScrollArea: classes.calendarScrollArea,
        }}
      />
      <ShiftDateList
        days={days}
        assignmentsByDay={assignmentsByDay}
        availabilityByPersonDay={availabilityByPersonDay}
        availabilityFailed={availabilityFailed}
        headersByDay={headersByDay}
        requirementsReady={requiredByDay !== null}
        requiredByDay={requiredByDay}
        selectedDate={selectedCell?.shiftTypeId === activeShiftTypeId ? selectedCell.date : null}
        focusedInstructorId={focusedInstructorId}
        myInstructorId={myInstructorId}
        autoAssignMode={autoAssignMode}
        autoAssignDates={autoAssignDates}
        isDateDisabled={isDateDisabled}
        onSelectDate={handleDateClick}
      />
    </Card>
  );
}
