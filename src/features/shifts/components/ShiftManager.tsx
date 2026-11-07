import { useMemo, useState } from 'react';

import {
  Box,
  Card,
  Checkbox,
  Drawer,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { MonthView, type ScheduleEventData } from '@mantine/schedule';

import 'dayjs/locale/ja';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { useMe } from '@/features/auth/queries';
import type { Availability } from '@/features/availabilities/schema';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { DepartmentTag } from '@/features/departments/DepartmentTag';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import { compareInstructorCertification, compareInstructorKana } from '../candidate-display';
import { useShiftAssignmentEditor } from '../queries';
import type { AutoAssignProposal, AvailableInstructor, ShiftViewItem } from '../schema';
import { summarizeStaffing } from '../staffing';
import { getCalendarDayColor, shortDateLabel, toMonth } from '../view-utils';
import { calculateFairShare } from '../workload';
import { AutoAssignToolbar } from './AutoAssignToolbar';
import {
  buildCalendarEvents,
  isHeaderEventPayload,
  resolveAssignmentsByDay,
  type AssignmentEventPayload,
} from './calendar-events';
import { DayHeaderLayer } from './DayHeaderLayer';
import type { StagedRequirements } from './requirement-stage';
import type { SelectedCell, StagedCell } from './shift-manager-types';
import { cellKey, weekdayLabel } from './shift-manager-utils';
import classes from './ShiftManager.module.css';
import { useShiftManagerController } from './useShiftManagerController';

const ASSIGNMENT_DRAWER_HEIGHT = '55vh';

type CandidateSortMode = 'certification' | 'kana' | 'workload';

/** シフト枠（日付 × 部門 × シフト種別）を月間シフト表で編集する管理コンポーネント。 */
export function ShiftManager() {
  const controller = useShiftManagerController();
  const me = useMe();

  return (
    <ShiftManagerContent controller={controller} myInstructorId={me.data?.instructorId ?? null} />
  );
}

type ShiftManagerContentProps = {
  controller: ReturnType<typeof useShiftManagerController>;
  myInstructorId: string | null;
};

/** シフト管理画面の表示と各編集コントロールを組み立てる。 */
function ShiftManagerContent({ controller, myInstructorId }: ShiftManagerContentProps) {
  const selectedCell = controller.selectedCell;
  const selectedCellDateColor = controller.selectedCell
    ? getCalendarDayColor(controller.selectedCell.date)
    : undefined;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>シフト管理</Title>
        <Select
          label="部門"
          data={departmentCodeSchema.options.map((code) => ({
            value: code,
            label: getDepartmentAppearance(code).label,
          }))}
          value={controller.departmentCode}
          onChange={(value) => {
            if (!value || value === controller.departmentCode) return;
            const parsed = departmentCodeSchema.safeParse(value);
            if (parsed.success) {
              controller.requestNavigation({ type: 'department', nextDepartmentCode: parsed.data });
            }
          }}
          renderOption={({ option }) => <DepartmentTag code={option.value} name={option.label} />}
          leftSection={(() => {
            const SelectedIcon = getDepartmentAppearance(controller.departmentCode).icon;
            return <SelectedIcon size={16} stroke={1.75} />;
          })()}
          allowDeselect={false}
          w={{ base: '100%', sm: 280 }}
        />
      </Group>

      {controller.formData.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {controller.formData.isError && <ErrorAlert>フォームデータの取得に失敗しました</ErrorAlert>}
      {controller.requirements.isError && (
        <ErrorAlert>
          {controller.requirements.error?.message ?? '必要人数の取得に失敗しました'}
        </ErrorAlert>
      )}
      {controller.monthly.isError && (
        <ErrorAlert>
          {controller.monthly.error?.message ?? '月次シフトの取得に失敗しました'}
        </ErrorAlert>
      )}

      {controller.formData.data && (
        <>
          {controller.isDirty && (
            <UnsavedChangesBar
              count={controller.dirtyCount}
              description="表示中の月のシフト割当と必要人数をまとめて保存します"
              loading={controller.upsertMonthly.isPending}
              saveLabel="一括保存"
              onCancel={controller.resetStage}
              onSave={controller.saveMonthly}
            />
          )}
          {controller.upsertMonthly.isError && (
            <ErrorAlert>
              {controller.upsertMonthly.error?.message ?? '保存に失敗しました'}
            </ErrorAlert>
          )}

          <ShiftCalendar
            month={controller.month}
            onMonthChange={(nextMonth) =>
              controller.requestNavigation({ type: 'month', nextMonth: toMonth(nextMonth) })
            }
            days={controller.days}
            departmentCode={controller.departmentCode}
            shiftTypes={controller.formData.data.shiftTypes}
            activeShiftTypeId={controller.activeShiftTypeId}
            onChangeShiftType={controller.changeActiveShiftType}
            stagedShiftTypeIds={controller.stagedShiftTypeIds}
            shifts={controller.monthly.data?.shifts ?? []}
            stagedCells={controller.stagedCells}
            nameById={controller.nameById}
            selectedCell={controller.drawerOpened ? controller.selectedCell : null}
            myInstructorId={myInstructorId}
            onSelectCell={controller.openAssignmentDrawer}
            autoAssignMode={controller.autoAssignMode}
            autoAssignDates={controller.autoAssignDates}
            onStartAutoAssign={controller.startAutoAssign}
            onCancelAutoAssign={() => controller.setAutoAssignMode(false)}
            onToggleAutoAssignDate={(date) =>
              controller.setAutoAssignDates((current) => {
                const next = new Set(current);
                if (next.has(date)) next.delete(date);
                else next.add(date);
                return next;
              })
            }
            onRunAutoAssign={controller.runAutoAssign}
            isAutoAssigning={controller.isAutoAssigning}
            canRunAutoAssign={
              !!controller.autoAssignContext.data &&
              controller.requirementsReady &&
              !controller.activeShiftTypeMissingCertification
            }
            missingCertification={controller.activeShiftTypeMissingCertification}
            noSelectableDates={controller.hasNoAutoAssignSelectableDates}
            shortageByCell={controller.shortageByCell}
            stagedRequirements={controller.stagedRequirements}
            requiredByDay={controller.requiredByDay}
            isAutoAssignSelectableDate={controller.isAutoAssignSelectableDate}
            onOpenBulkModal={() => controller.setBulkModalOpened(true)}
          />

          {controller.drawerOpened && <Box h={ASSIGNMENT_DRAWER_HEIGHT} aria-hidden />}
          <Drawer
            opened={controller.drawerOpened}
            onClose={() => controller.setDrawerOpened(false)}
            position="bottom"
            size={ASSIGNMENT_DRAWER_HEIGHT}
            title={
              controller.selectedCell ? (
                <Group justify="space-between" wrap="nowrap" w="100%">
                  <Stack gap={0}>
                    <Text fw={600} {...(selectedCellDateColor ? { c: selectedCellDateColor } : {})}>
                      {shortDateLabel(controller.selectedCell.date)}
                    </Text>
                    <Text size="xs" c="dimmed" fw={400}>
                      {controller.formData.data.shiftTypes.find(
                        (shiftType) => shiftType.id === controller.selectedCell?.shiftTypeId,
                      )?.name ?? ''}
                    </Text>
                  </Stack>
                  <Group gap="xs" wrap="nowrap" mr="xs">
                    <Text size="sm" c="dimmed">
                      {controller.selectedAssignmentCount}名
                    </Text>
                    {(controller.selectedStagedCell || controller.selectedStagedRequirement) && (
                      <AppBadge kind="pending">未保存</AppBadge>
                    )}
                  </Group>
                </Group>
              ) : undefined
            }
            offset={8}
            radius="md"
            overlayProps={{ backgroundOpacity: 0.18 }}
            classNames={{
              body: classes.assignmentDrawerBody,
              title: classes.assignmentDrawerTitle,
            }}
          >
            {selectedCell && (
              <AssignmentPanel
                key={`${selectedCell.date}-${controller.departmentCode}-${selectedCell.shiftTypeId}`}
                date={selectedCell.date}
                departmentCode={controller.departmentCode}
                shiftTypeId={selectedCell.shiftTypeId}
                stagedCell={controller.stagedCells.get(
                  cellKey(selectedCell.date, selectedCell.shiftTypeId),
                )}
                onStageChange={(next) =>
                  controller.stageCell(cellKey(selectedCell.date, selectedCell.shiftTypeId), next)
                }
                requirementsReady={controller.requirementsReady}
                requiredCount={controller.selectedRequiredCount}
                onRequiredCountChange={(value) =>
                  controller.stageRequirement(selectedCell.date, selectedCell.shiftTypeId, value)
                }
                onRegisterInstructorNames={controller.registerInstructorNames}
                conflictLabelById={controller.conflictLabelById}
                currentMonthWorkDays={controller.currentMonthWorkDays}
                availabilities={controller.availabilities.data ?? []}
              />
            )}
          </Drawer>
        </>
      )}

      <Modal
        opened={controller.pendingNav !== null || controller.blocker.status === 'blocked'}
        onClose={controller.cancelNavigation}
        title="未保存の変更があります"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            未保存の変更が {controller.dirtyCount} 件あります。 このまま
            {controller.pendingNav?.type === 'department'
              ? '部門を切り替える'
              : controller.pendingNav?.type === 'month'
                ? '対象月を変更する'
                : controller.pendingNav?.type === 'shiftType'
                  ? 'シフト種別を切り替える'
                  : '別のページへ移動する'}
            と、これらの変更は破棄されます。
          </Text>
          <Group justify="flex-end" gap="xs">
            <AppButton intent="secondary" onClick={controller.cancelNavigation}>
              キャンセル
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={controller.confirmNavigation}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={controller.bulkModalOpened}
        onClose={() => controller.setBulkModalOpened(false)}
        title="必要人数を一括設定"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            表示中の部門・シフト種別・月の、必要人数が未設定の日にだけ設定します。設定済みの日は上書きしません。
          </Text>
          <RequiredCountInputs
            weekday={controller.weekdayRequiredCount}
            weekendHoliday={controller.weekendHolidayRequiredCount}
            onWeekdayChange={controller.setWeekdayRequiredCount}
            onWeekendHolidayChange={controller.setWeekendHolidayRequiredCount}
            weekdayLabel="平日の人数"
            weekendHolidayLabel="土日祝の人数"
          />
          <Text size="sm" fw={600}>
            適用対象: {controller.bulkTargetDates.length}日
          </Text>
          <AppButton
            intent="primary"
            onClick={controller.applyBulkRequirementCounts}
            disabled={
              controller.weekdayRequiredCount === '' ||
              controller.weekendHolidayRequiredCount === '' ||
              controller.bulkTargetDates.length === 0
            }
          >
            適用
          </AppButton>
        </Stack>
      </Modal>
    </Stack>
  );
}

type RequiredCountInputsProps = {
  weekday: number | '';
  weekendHoliday: number | '';
  onWeekdayChange: (value: number | '') => void;
  onWeekendHolidayChange: (value: number | '') => void;
  weekdayLabel: string;
  weekendHolidayLabel: string;
};

/** 平日／土日祝の人数入力。空欄は 0 にせず '' のまま保持し、実行側で無効化する。 */
function RequiredCountInputs({
  weekday,
  weekendHoliday,
  onWeekdayChange,
  onWeekendHolidayChange,
  weekdayLabel,
  weekendHolidayLabel,
}: RequiredCountInputsProps) {
  return (
    <Group grow align="flex-start">
      <NumberInput
        label={weekdayLabel}
        allowDecimal={false}
        allowNegative={false}
        min={0}
        value={weekday}
        onChange={(value) => onWeekdayChange(typeof value === 'number' ? value : '')}
      />
      <NumberInput
        label={weekendHolidayLabel}
        allowDecimal={false}
        allowNegative={false}
        min={0}
        value={weekendHoliday}
        onChange={(value) => onWeekendHolidayChange(typeof value === 'number' ? value : '')}
      />
    </Group>
  );
}

type ShiftTypeOption = {
  id: string;
  name: string;
};

type ShiftCalendarProps = {
  month: string;
  onMonthChange: (month: string) => void;
  days: string[];
  departmentCode: DepartmentCode;
  shiftTypes: ShiftTypeOption[];
  activeShiftTypeId: string;
  onChangeShiftType: (shiftTypeId: string) => void;
  stagedShiftTypeIds: Set<string>;
  shifts: ShiftViewItem[];
  stagedCells: Map<string, StagedCell>;
  nameById: Map<string, string>;
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
  stagedRequirements: StagedRequirements;
  /** 日 → 表示用の必要人数。必要人数の取得前は null（未設定と区別して何も出さない）。 */
  requiredByDay: Map<string, number | null> | null;
  isAutoAssignSelectableDate: (date: string) => boolean;
  onOpenBulkModal: () => void;
};

/** 選択中の部門・シフト種別について、担当者を日付ごとに縦表示する月間カレンダー。 */
function ShiftCalendar({
  month,
  onMonthChange,
  days,
  departmentCode,
  shiftTypes,
  activeShiftTypeId,
  onChangeShiftType,
  stagedShiftTypeIds,
  shifts,
  stagedCells,
  nameById,
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
  stagedRequirements,
  requiredByDay,
  isAutoAssignSelectableDate,
  onOpenBulkModal,
}: ShiftCalendarProps) {
  const shiftByCell = useMemo(() => {
    const map = new Map<string, ShiftViewItem>();
    for (const shift of shifts) {
      if (shift.department.code === departmentCode) {
        map.set(cellKey(shift.date, shift.shiftType.id), shift);
      }
    }
    return map;
  }, [departmentCode, shifts]);

  const assignmentsByDay = useMemo(
    () =>
      resolveAssignmentsByDay({
        days,
        shiftTypeId: activeShiftTypeId,
        shiftByCell,
        stagedCells,
        nameById,
      }),
    [activeShiftTypeId, days, nameById, shiftByCell, stagedCells],
  );

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
      }),
    [
      activeShiftTypeId,
      assignmentsByDay,
      days,
      requiredByDay,
      shiftByCell,
      shortageByCell,
      stagedCells,
      stagedRequirements,
    ],
  );

  const staffingSummary = useMemo(
    () =>
      requiredByDay
        ? summarizeStaffing(
            days.map((day) => ({
              required: requiredByDay.get(day) ?? null,
              assigned: assignmentsByDay.get(day)?.length ?? 0,
            })),
          )
        : null,
    [days, requiredByDay, assignmentsByDay],
  );
  const activeShiftTypeName = shiftTypes.find((type) => type.id === activeShiftTypeId)?.name ?? '';

  // 日・イベント共通のクリック処理。自動割当モードでは対象日の切り替えだけを行う。
  const handleDateClick = (date: string) => {
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
    <Card padding="md">
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
            ? `${getDepartmentAppearance(departmentCode).label} / ${activeShiftTypeName} / ${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月：不足${staffingSummary.shortDays}日・未設定${staffingSummary.unsetCount}枠`
            : '必要人数を読み込み中…'}
        </Text>
      </Group>

      <MonthView
        date={`${month}-01`}
        onDateChange={onMonthChange}
        events={events}
        locale="ja"
        firstDayOfWeek={1}
        weekdayFormat="dd"
        withOutsideDays={false}
        consistentWeeks
        maxEventsPerDay={maxEventsPerDay}
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
            // 自動割当モードでは、対象にできない日（未設定・0名）をクリック・キー操作から外す
            disabled: autoAssignMode && !isAutoAssignSelectableDate(date) ? true : undefined,
            'data-selected': selected || undefined,
            'data-staged':
              stagedCells.has(cellKey(date, activeShiftTypeId)) ||
              stagedRequirements.has(cellKey(date, activeShiftTypeId)) ||
              undefined,
            'aria-label': `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekdayLabel(date)}）の割り当てを編集`,
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
        onEventClick={(event) => {
          const date = event.payload?.date;
          if (typeof date === 'string') handleDateClick(date);
        }}
        renderEvent={(event, props) => {
          const payload = event.payload;
          if (isHeaderEventPayload(payload)) {
            return (
              <DayHeaderLayer
                payload={payload}
                style={props.style}
                onSelectDate={(date) => onSelectCell({ date, shiftTypeId: activeShiftTypeId })}
                onClickDate={handleDateClick}
              />
            );
          }
          return (
            <UnstyledButton
              {...props}
              className={[props.className, classes.instructorEvent].filter(Boolean).join(' ')}
              data-current-user={
                payload?.kind === 'instructor' && payload.instructorId === myInstructorId
                  ? true
                  : undefined
              }
            >
              {event.title}
            </UnstyledButton>
          );
        }}
        classNames={{
          header: classes.calendarHeader,
          monthViewDay: classes.calendarDay,
          monthViewWeekday: classes.calendarWeekday,
          monthViewScrollArea: classes.calendarScrollArea,
        }}
      />
    </Card>
  );
}

type AssignmentPanelProps = {
  date: string;
  departmentCode: DepartmentCode;
  shiftTypeId: string;
  stagedCell: StagedCell | undefined;
  onStageChange: (next: StagedCell) => void;
  onRegisterInstructorNames: (entries: Array<{ id: string; name: string }>) => void;
  /** instructorId → 競合先の表示ラベル（フォームの現在値ベースで親が算出） */
  conflictLabelById: Map<string, string>;
  /** instructorId → 当月の勤務日数（全部門横断・親がステージ済み編集を反映してライブ計算） */
  currentMonthWorkDays: Map<string, number>;
  availabilities: Availability[];
  requirementsReady: boolean;
  /** 表示用の必要人数（未設定は null） */
  requiredCount: number | null;
  onRequiredCountChange: (value: number | null) => void;
};

/**
 * 選択セルに連動する割り当て編集パネル。編集内容は親のステージに反映し、即時保存しない。
 * 表示・編集対象は props の stagedCell / editData から派生させ、
 * ローカル state は UI コントロール（検索・並び順）のみ持つ。これにより
 * セル切替やサーバー再取得のたびに props に確実に追随する。
 */
function AssignmentPanel({
  date,
  departmentCode,
  shiftTypeId,
  stagedCell,
  onStageChange,
  onRegisterInstructorNames,
  conflictLabelById,
  currentMonthWorkDays,
  availabilities,
  requirementsReady,
  requiredCount,
  onRequiredCountChange,
}: AssignmentPanelProps) {
  const editData = useShiftAssignmentEditor({ date, departmentCode, shiftTypeId });

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<CandidateSortMode>('certification');

  // 表示・編集対象の割り当て内容: stagedCell 優先、無ければサーバー state。
  const stagedInstructorIds = stagedCell?.instructorIds;
  const serverInstructorIds = editData.data?.shift?.assignedInstructorIds;
  const displayedDescription = stagedCell?.description ?? editData.data?.shift?.description ?? '';
  const selectedSet = new Set(stagedInstructorIds ?? serverInstructorIds ?? []);

  // 総勤務日数（負荷） = API が返す「月外・保存済み」の土台 + 親が算出した「当月・ライブ」分。
  // ステージ中の未保存編集も currentMonthWorkDays 経由で即座に反映される。
  const loadByInstructor = useMemo(() => {
    const map = new Map<string, number>();
    for (const inst of editData.data?.availableInstructors ?? []) {
      map.set(inst.id, inst.seasonWorkDaysOutsideMonth + (currentMonthWorkDays.get(inst.id) ?? 0));
    }
    return map;
  }, [editData.data?.availableInstructors, currentMonthWorkDays]);

  // 偏差バーの基準（平均・最大偏差）はフルの候補プールから算出する。
  // 検索で絞り込んでもバーのスケールが変動しないようにするため。
  const { fairShareAverage, maxAbsDeviation } = useMemo(() => {
    const loads = Array.from(loadByInstructor.values());
    const average = calculateFairShare(loads);
    const maxDeviation = loads.reduce((max, load) => Math.max(max, Math.abs(load - average)), 0);
    return { fairShareAverage: average, maxAbsDeviation: maxDeviation };
  }, [loadByInstructor]);

  const candidates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ja-JP');
    return [...(editData.data?.availableInstructors ?? [])]
      .filter((inst) => {
        if (!query) {
          return true;
        }
        return `${inst.displayName} ${inst.displayNameKana ?? ''}`
          .toLocaleLowerCase('ja-JP')
          .includes(query);
      })
      .sort((a, b) => {
        if (sortMode === 'workload') {
          return (
            (loadByInstructor.get(a.id) ?? 0) - (loadByInstructor.get(b.id) ?? 0) ||
            compareInstructorKana(a, b)
          );
        }
        return sortMode === 'certification'
          ? compareInstructorCertification(a, b)
          : compareInstructorKana(a, b);
      });
  }, [editData.data?.availableInstructors, search, sortMode, loadByInstructor]);

  const availabilityByInstructor = useMemo(() => {
    const byInstructor = new Map<string, Availability>();
    for (const availability of availabilities) {
      if (availability.date === date) {
        byInstructor.set(availability.instructorId, availability);
      }
    }
    return byInstructor;
  }, [availabilities, date]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      const instructor = editData.data?.availableInstructors.find(
        (candidate) => candidate.id === id,
      );
      if (instructor) {
        onRegisterInstructorNames([{ id: instructor.id, name: instructor.displayName }]);
      }
    }
    onStageChange({
      instructorIds: [...next],
      description: displayedDescription,
    });
  };

  const changeDescription = (value: string) => {
    onStageChange({
      instructorIds: [...selectedSet],
      description: value,
    });
  };

  return (
    <Stack gap="md">
      <NumberInput
        label="必要人数"
        description="空欄は未設定です。0名は開講予定なしで、自動割当の対象外です（手動の割り当ては可能です）"
        allowDecimal={false}
        allowNegative={false}
        min={0}
        disabled={!requirementsReady}
        value={requiredCount ?? ''}
        onChange={(value) => onRequiredCountChange(typeof value === 'number' ? value : null)}
        w={{ base: '100%', sm: 420 }}
      />
      {editData.isLoading && (
        <Text c="dimmed" size="sm">
          候補を読み込み中…
        </Text>
      )}
      {editData.isError && (
        <ErrorAlert>{editData.error?.message ?? '候補の取得に失敗しました'}</ErrorAlert>
      )}

      {editData.data && (
        <>
          <Group justify="space-between" align="center" wrap="wrap">
            <SegmentedControl
              size="sm"
              value={sortMode}
              onChange={(value) => setSortMode(parseCandidateSortMode(value))}
              data={[
                { value: 'certification', label: '資格順' },
                { value: 'kana', label: 'かな順' },
                { value: 'workload', label: '負荷が低い順' },
              ]}
            />
            <TextInput
              aria-label="名前検索"
              placeholder="名前を検索"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              size="sm"
              w={{ base: '100%', sm: 320 }}
            />
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
            {candidates.length === 0 ? (
              <Text c="dimmed" size="sm">
                候補がありません
              </Text>
            ) : (
              candidates.map((instructor) => (
                <InstructorCard
                  key={instructor.id}
                  instructor={instructor}
                  departmentCode={departmentCode}
                  checked={selectedSet.has(instructor.id)}
                  onToggle={() => toggle(instructor.id)}
                  conflictLabel={conflictLabelById.get(instructor.id)}
                  load={loadByInstructor.get(instructor.id) ?? 0}
                  fairShareAverage={fairShareAverage}
                  maxAbsDeviation={maxAbsDeviation}
                  availability={availabilityByInstructor.get(instructor.id)}
                />
              ))
            )}
          </SimpleGrid>

          <Textarea
            label="備考"
            value={displayedDescription}
            onChange={(e) => changeDescription(e.currentTarget.value)}
            maxLength={500}
            rows={3}
          />
        </>
      )}
    </Stack>
  );
}

type InstructorCardProps = {
  instructor: AvailableInstructor;
  departmentCode: DepartmentCode;
  checked: boolean;
  onToggle: () => void;
  /** 競合先（同日の別 Shift）の表示ラベル。未競合なら undefined */
  conflictLabel?: string | undefined;
  /** 総勤務日数（月外・保存済みの土台 + 当月・ライブ分の合算） */
  load: number;
  /** 候補プール全体のフェアシェア（総勤務日数の平均） */
  fairShareAverage: number;
  /** 候補プール内の |総勤務日数 − 平均| の最大値（偏差バーのスケール基準） */
  maxAbsDeviation: number;
  availability: Availability | undefined;
};

/**
 * 割り当て候補インストラクターの選択カード。
 * 同日の別 Shift に割り当て済み（競合）かつ未チェックの場合は disabled にし、
 * 新規の二重割り当てを防ぐ（既存の割り当て解除はできるよう checked 時は除外）。
 */
function InstructorCard({
  instructor,
  departmentCode,
  checked,
  onToggle,
  conflictLabel,
  load,
  fairShareAverage,
  maxAbsDeviation,
  availability,
}: InstructorCardProps) {
  const isConflict = conflictLabel !== undefined;
  const isUnavailable = availability?.type === 'UNAVAILABLE';
  const isDisabled = (isConflict || isUnavailable) && !checked;
  const availabilityLabel =
    availability?.type === 'AVOID'
      ? `要調整${availability.note ? `: ${availability.note}` : ''}`
      : availability?.type === 'UNAVAILABLE'
        ? `勤務不可${availability.note ? `: ${availability.note}` : ''}`
        : undefined;

  return (
    <Tooltip
      label={isConflict ? `${conflictLabel}に割当済` : availabilityLabel}
      disabled={!isConflict && !availabilityLabel}
      withArrow
    >
      <Box h="100%">
        <Checkbox.Card
          checked={checked}
          onClick={onToggle}
          disabled={isDisabled}
          className={classes.instructorCard}
          h="100%"
        >
          <Group justify="space-between" gap="sm" wrap="nowrap" align="flex-start">
            <Group gap="sm" wrap="nowrap" align="flex-start" flex={1} miw={0}>
              <Checkbox.Indicator />
              <Stack gap={4} flex={1} miw={0}>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={500}>
                    {instructor.displayName}
                  </Text>
                  {instructor.displayNameKana && (
                    <Text size="xs" c="dimmed">
                      {instructor.displayNameKana}
                    </Text>
                  )}
                  {instructor.hasQualificationWarning && (
                    <AppBadge kind="warning" size="xs">
                      資格要件外の既存割当
                    </AppBadge>
                  )}
                  {availability?.type === 'AVOID' && (
                    <AppBadge kind="warning" size="xs">
                      要調整
                    </AppBadge>
                  )}
                  {availability?.type === 'UNAVAILABLE' && (
                    <AppBadge kind="pending" size="xs">
                      勤務不可
                    </AppBadge>
                  )}
                </Group>
                {instructor.certifications.length > 0 && (
                  <Group gap={4} wrap="wrap">
                    {instructor.certifications.map((cert) => (
                      <AppBadge
                        key={`${cert.shortName}:${cert.tierRank}`}
                        kind="certification"
                        departmentCode={departmentCode}
                        size="xs"
                      >
                        {cert.shortName}
                      </AppBadge>
                    ))}
                  </Group>
                )}
              </Stack>
            </Group>
            <WorkloadDeviationBar
              load={load}
              average={fairShareAverage}
              maxAbsDeviation={maxAbsDeviation}
            />
          </Group>
        </Checkbox.Card>
      </Box>
    </Tooltip>
  );
}

type WorkloadDeviationBarProps = {
  /** 総勤務日数（月外・保存済みの土台 + 当月・ライブ分の合算） */
  load: number;
  average: number;
  maxAbsDeviation: number;
};

/**
 * 総勤務日数の対プール平均偏差を表す横バー。中央 = 平均（偏差 0）。
 * 平均未満は中央から左へ teal、平均超過は中央から右へ orange を伸ばし、
 * 「誰がプール平均よりどれだけ下振れ/上振れしているか」を一目で示す。
 * ステージ中の未保存編集も load に即座に反映されるため、割り当てを変えるたびに動く。
 */
function WorkloadDeviationBar({ load, average, maxAbsDeviation }: WorkloadDeviationBarProps) {
  const deviation = load - average;
  const pct = maxAbsDeviation === 0 ? 0 : (Math.abs(deviation) / maxAbsDeviation) * 50;
  const isUnder = deviation <= 0;
  const tooltip = `総 ${load}日（平均 ${average.toFixed(1)}日 / 平均比 ${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}日）`;

  return (
    <Tooltip label={tooltip} withArrow>
      <Box pos="relative" w={100} h={8} bg="gray.2" bdrs={4} className={classes.deviationBarTrack}>
        <Box pos="absolute" top={0} bottom={0} left="50%" w={1} bg="gray.5" />
        <Box
          pos="absolute"
          top={0}
          bottom={0}
          w={`${pct}%`}
          bg={isUnder ? 'teal.5' : 'orange.5'}
          {...(isUnder ? { right: '50%' } : { left: '50%' })}
          bdrs={4}
        />
      </Box>
    </Tooltip>
  );
}

function parseCandidateSortMode(value: string): CandidateSortMode {
  if (value === 'workload' || value === 'kana' || value === 'certification') {
    return value;
  }
  return 'certification';
}
