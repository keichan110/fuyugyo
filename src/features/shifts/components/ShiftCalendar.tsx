import { useMemo } from 'react';

import { Box, Card, Group, Tabs, Text } from '@mantine/core';
import { MonthView, type ScheduleEventData } from '@mantine/schedule';
import { IconLock, IconPencil } from '@tabler/icons-react';

import 'dayjs/locale/ja';

import { AppButton } from '@/components/AppButton';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

import type { FrameComposition } from '../qualification-composition';
import type { AutoAssignProposal, ShiftViewItem } from '../schema';
import type { StaffingMonthlySummary } from '../staffing';
import { getCalendarDayColor } from '../view-utils';
import { AutoAssignToolbar } from './AutoAssignToolbar';
import {
  buildCalendarEvents,
  isHeaderEventPayload,
  type AssignmentEventPayload,
  type DayAssignments,
  type HeaderEventPayload,
} from './calendar-events';
import { DayHeaderLayer } from './DayHeaderLayer';
import type { StagedRequirements } from './requirement-stage';
import type { SelectedCell, StagedCell } from './shift-manager-types';
import { cellKey, weekdayLabel } from './shift-manager-utils';
import { ShiftDateList } from './ShiftDateList';
import classes from './ShiftManager.module.css';

type ShiftTypeOption = {
  id: string;
  name: string;
};

type ShiftCalendarProps = {
  publicationControls: React.ReactNode;
  month: string;
  onMonthChange: (month: string) => void;
  days: string[];
  departmentCode: DepartmentCode;
  shiftTypes: ShiftTypeOption[];
  activeShiftTypeId: string;
  onChangeShiftType: (shiftTypeId: string) => void;
  stagedShiftTypeIds: Set<string>;
  shiftByCell: Map<string, ShiftViewItem>;
  assignmentsByDay: DayAssignments;
  focusedInstructor: { id: string; name: string } | null;
  onClearInstructor: () => void;
  staffingSummary: StaffingMonthlySummary | null;
  stagedCells: Map<string, StagedCell>;
  selectedCell: SelectedCell | null;
  myInstructorId: string | null;
  onSelectCell: (cell: SelectedCell) => void;
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
  month,
  onMonthChange,
  days,
  departmentCode,
  shiftTypes,
  activeShiftTypeId,
  onChangeShiftType,
  stagedShiftTypeIds,
  shiftByCell,
  assignmentsByDay,
  focusedInstructor,
  onClearInstructor,
  staffingSummary,
  stagedCells,
  selectedCell,
  myInstructorId,
  onSelectCell,
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
  const focusedInstructorId = focusedInstructor?.id ?? null;
  // 自動割当コンテキストの取得後に、必要資格が未設定の種別かを判定する
  const requirementUnset = compositionByDay?.values().next().value?.requirementUnset ?? false;
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

  const activeShiftTypeName = shiftTypes.find((type) => type.id === activeShiftTypeId)?.name ?? '';

  // 日・イベント共通のクリック処理。自動割当モードでは対象日の切り替えだけを行う。
  const handleDateClick = (date: string) => {
    if (isAutoAssigning) return;
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
      <Tabs
        value={activeShiftTypeId}
        onChange={(value) => value && onChangeShiftType(value)}
        mb="sm"
      >
        <Tabs.List className={classes.shiftTypeTabsList}>
          {shiftTypes.map((shiftType) => (
            <Tabs.Tab
              key={shiftType.id}
              value={shiftType.id}
              disabled={isAutoAssigning}
              rightSection={
                stagedShiftTypeIds.has(shiftType.id) ? (
                  <Box w={8} h={8} bdrs="50%" bg="var(--mantine-color-orange-6)" />
                ) : undefined
              }
            >
              {shiftType.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <AutoAssignToolbar
        publicationControls={publicationControls}
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

      <Group justify="space-between" mb="xs" gap="sm" wrap="wrap">
        <Text size="sm" fw={600}>
          {staffingSummary
            ? `${getDepartmentAppearance(departmentCode).label} / ${activeShiftTypeName} / ${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月：不足${staffingSummary.shortDays}日・未設定${staffingSummary.unsetCount}枠${requirementUnset ? '・必要資格未設定' : ''}`
            : '必要人数を読み込み中…'}
        </Text>
      </Group>

      <Group gap="md" mb="xs" aria-label="公開状態の凡例">
        <Group gap={4}>
          <IconLock size={12} aria-hidden />
          <Text size="xs">公開済み（編集・自動割当から保護）</Text>
        </Group>
        <Group gap={4}>
          <IconPencil size={12} aria-hidden />
          <Text size="xs">下書き</Text>
        </Group>
      </Group>
      {focusedInstructor && (
        <Group gap="xs" mb="xs" wrap="wrap">
          <Text size="xs" c="blue">
            {focusedInstructor.name}の配置日を強調中
          </Text>
          <AppButton intent="tertiary" size="compact-xs" onClick={onClearInstructor}>
            分析を解除
          </AppButton>
        </Group>
      )}
      <MonthView
        className={classes.monthView}
        date={`${month}-01`}
        onDateChange={onMonthChange}
        previousControlProps={{ disabled: isAutoAssigning }}
        nextControlProps={{ disabled: isAutoAssigning }}
        todayControlProps={{ disabled: isAutoAssigning }}
        events={events}
        locale="ja"
        firstDayOfWeek={1}
        weekdayFormat="dd"
        withOutsideDays={false}
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
        monthYearSelectProps={{
          labelFormat: (date) => `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`,
          monthsListFormat: (date) => `${Number(date.slice(5, 7))}月`,
        }}
        viewSelectProps={{ views: ['month'], style: { display: 'none' } }}
        getDayProps={(date) => {
          const selected =
            selectedCell?.date === date && selectedCell.shiftTypeId === activeShiftTypeId;
          const calendarDayColor = getCalendarDayColor(date);
          return {
            'data-shift-date': date,
            'data-focused-instructor':
              (focusedInstructorId !== null &&
                assignmentsByDay.get(date)?.some((person) => person.id === focusedInstructorId)) ||
              undefined,
            // 自動割当モードでは、対象にできない日（未設定・0名）をクリック・キー操作から外す
            disabled: isDateDisabled(date) || undefined,
            'data-selected': selected || undefined,
            'data-staged':
              stagedCells.has(cellKey(date, activeShiftTypeId)) ||
              stagedRequirements.has(cellKey(date, activeShiftTypeId)) ||
              undefined,
            'aria-label': `${shiftByCell.get(cellKey(date, activeShiftTypeId))?.status === 'PUBLISHED' ? '公開済み。自動割当の対象外。' : ''}${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekdayLabel(date)}）の割り当てを編集`,
            style: {
              color: calendarDayColor ? `var(--mantine-color-${calendarDayColor}-7)` : undefined,
              backgroundColor:
                autoAssignMode && autoAssignDates.has(date)
                  ? 'var(--mantine-color-blue-0)'
                  : undefined,
              outline:
                autoAssignMode && autoAssignDates.has(date)
                  ? '2px solid var(--mantine-color-blue-5)'
                  : undefined,
            },
          };
        }}
        onDayClick={handleDateClick}
        renderEvent={(event, props) => {
          const payload = event.payload;
          if (isHeaderEventPayload(payload)) {
            return <DayHeaderLayer payload={payload} style={props.style} />;
          }
          return (
            <Box
              style={props.style}
              className={classes.instructorEvent}
              data-focused={
                (payload?.kind === 'instructor' && payload.instructorId === focusedInstructorId) ||
                undefined
              }
              data-dimmed={
                (focusedInstructorId !== null &&
                  payload?.kind === 'instructor' &&
                  payload.instructorId !== focusedInstructorId) ||
                undefined
              }
              data-current-user={
                (payload?.kind === 'instructor' && payload.instructorId === myInstructorId) ||
                undefined
              }
            >
              {event.title}
            </Box>
          );
        }}
        classNames={{
          header: classes.calendarHeader,
          monthViewDay: classes.calendarDay,
          monthViewWeekday: classes.calendarWeekday,
          monthViewScrollArea: classes.calendarScrollArea,
        }}
      />
      <ShiftDateList
        days={days}
        assignmentsByDay={assignmentsByDay}
        headersByDay={headersByDay}
        requirementsReady={requiredByDay !== null}
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
