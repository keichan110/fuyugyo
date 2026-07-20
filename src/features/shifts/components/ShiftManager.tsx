import { useMemo, useState } from 'react';

import {
  ActionIcon,
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
import { IconMessage, IconWand } from '@tabler/icons-react';

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
import { addDays, getCalendarDayColor, shortDateLabel, toMonth } from '../view-utils';
import { calculateFairShare } from '../workload';
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
  const availabilityStatusByInstructor = useMemo(
    () =>
      new Map(
        (controller.autoAssignContext.data?.instructors ?? []).map((instructor) => [
          instructor.id,
          instructor.availabilityStatus,
        ]),
      ),
    [controller.autoAssignContext.data?.instructors],
  );

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
      {controller.monthly.isError && (
        <ErrorAlert>
          {controller.monthly.error?.message ?? '月次シフトの取得に失敗しました'}
        </ErrorAlert>
      )}

      {controller.formData.data && (
        <>
          {controller.isDirty && (
            <UnsavedChangesBar
              count={controller.stagedCells.size}
              description="表示中の月のシフト割当をまとめて保存します"
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
            onOpenAutoAssignModal={() => controller.setAutoAssignModalOpened(true)}
            shortageByCell={controller.shortageByCell}
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
                    {controller.selectedStagedCell && <AppBadge kind="pending">未保存</AppBadge>}
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
                onRegisterInstructorNames={controller.registerInstructorNames}
                conflictLabelById={controller.conflictLabelById}
                currentMonthWorkDays={controller.currentMonthWorkDays}
                availabilities={controller.availabilities.data ?? []}
                availabilityStatusByInstructor={availabilityStatusByInstructor}
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
            未保存の変更が {controller.stagedCells.size} 件あります。 このまま
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
        opened={controller.autoAssignModalOpened}
        onClose={() => !controller.isAutoAssigning && controller.setAutoAssignModalOpened(false)}
        title="自動割当の条件"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {controller.formData.data?.shiftTypes.find(
              (shiftType) => shiftType.id === controller.autoAssignShiftTypeId,
            )?.name ?? ''}{' '}
            を{controller.autoAssignDates.size}日分、現在のステージへ直接反映します。
          </Text>
          <Select
            label="対象シフト種別"
            value={controller.autoAssignShiftTypeId}
            onChange={(value) => value && controller.setAutoAssignShiftTypeId(value)}
            data={
              controller.formData.data?.shiftTypes.map((shiftType) => ({
                value: shiftType.id,
                label: shiftType.name,
              })) ?? []
            }
            allowDeselect={false}
          />
          <Group grow align="flex-start">
            <NumberInput
              label="平日の人数"
              min={0}
              value={controller.weekdayRequiredCount}
              onChange={(value) =>
                controller.setWeekdayRequiredCount(typeof value === 'number' ? value : 0)
              }
            />
            <NumberInput
              label="土日祝の人数"
              min={0}
              value={controller.weekendHolidayRequiredCount}
              onChange={(value) =>
                controller.setWeekendHolidayRequiredCount(typeof value === 'number' ? value : 0)
              }
            />
          </Group>
          <Text size="xs" c="dimmed">
            必要資格は表示・判定に使用します。変更はシフト種別設定画面で行ってください。
          </Text>
          <AppButton intent="tertiary" component="a" href="/shift-types" size="xs">
            必要資格設定を開く
          </AppButton>
          {controller.autoAssignContext.data?.frames.find(
            (frame) => frame.shiftTypeId === controller.autoAssignShiftTypeId,
          )?.certificationTiers.length === 0 && (
            <ErrorAlert>この種別には必要資格が設定されていないため、提案できません。</ErrorAlert>
          )}
          <AppButton
            intent={controller.shortageByCell.size > 0 ? 'secondary' : 'primary'}
            leftSection={<IconWand size={16} />}
            onClick={controller.runAutoAssign}
            loading={controller.isAutoAssigning}
            disabled={!controller.autoAssignContext.data || controller.autoAssignDates.size === 0}
          >
            {controller.shortageByCell.size > 0 ? '別の案を出す' : '提案をステージへ反映'}
          </AppButton>
        </Stack>
      </Modal>
    </Stack>
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
  onOpenAutoAssignModal: () => void;
  shortageByCell: Map<string, AutoAssignProposal['shortage']>;
};

type AssignmentEventPayload =
  | { kind: 'instructor'; date: string; instructorId: string }
  | { kind: 'description'; date: string; description: string };

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
  onOpenAutoAssignModal,
  shortageByCell,
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

  const assignmentsByDay = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const day of days) {
      const key = cellKey(day, activeShiftTypeId);
      const serverShift = shiftByCell.get(key);
      const staged = stagedCells.get(key);
      const assigned = staged
        ? staged.instructorIds.map((id) => ({
            id,
            name:
              serverShift?.assignedInstructors.find((instructor) => instructor.id === id)
                ?.displayName ??
              nameById.get(id) ??
              id,
          }))
        : (serverShift?.assignedInstructors ?? []).map((instructor) => ({
            id: instructor.id,
            name: instructor.displayName,
          }));
      map.set(day, assigned);
    }
    return map;
  }, [activeShiftTypeId, days, nameById, shiftByCell, stagedCells]);

  const events = useMemo<ScheduleEventData<AssignmentEventPayload>[]>(() => {
    const instructorEvents = days.flatMap((day) =>
      (assignmentsByDay.get(day) ?? []).map(
        (instructor): ScheduleEventData<AssignmentEventPayload> => ({
          id: `${day}:${activeShiftTypeId}:${instructor.id}`,
          title: instructor.name,
          start: `${day} 00:00:00`,
          end: `${addDays(day, 1)} 00:00:00`,
          color: 'gray',
          payload: { kind: 'instructor', date: day, instructorId: instructor.id },
        }),
      ),
    );
    const descriptionEvents = days.flatMap((day) => {
      const key = cellKey(day, activeShiftTypeId);
      const description =
        stagedCells.get(key)?.description ?? shiftByCell.get(key)?.description ?? '';
      if (!description.trim()) {
        return [];
      }
      return [
        {
          id: `${day}:${activeShiftTypeId}:description`,
          title: description,
          start: `${day} 00:00:00`,
          end: `${addDays(day, 1)} 00:00:00`,
          color: 'gray',
          display: 'background' as const,
          payload: { kind: 'description' as const, date: day, description },
        },
      ];
    });
    const shortageEvents = days.flatMap((day) => {
      const shortage = shortageByCell.get(cellKey(day, activeShiftTypeId));
      if (!shortage || shortage.count === 0) return [];
      return [
        {
          id: `${day}:${activeShiftTypeId}:shortage`,
          title: `不足 ${shortage.count}名`,
          start: `${day} 00:00:00`,
          end: `${addDays(day, 1)} 00:00:00`,
          color: 'red',
          payload: {
            kind: 'description' as const,
            date: day,
            description: shortage.reasons.join(' / '),
          },
        },
      ];
    });
    return [...instructorEvents, ...descriptionEvents, ...shortageEvents];
  }, [activeShiftTypeId, assignmentsByDay, days, shiftByCell, shortageByCell, stagedCells]);

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

      <Group justify="space-between" mb="sm" wrap="wrap">
        {autoAssignMode ? (
          <>
            <Text size="sm" c="blue" fw={600}>
              自動割当する日を選択（{autoAssignDates.size}日）
            </Text>
            <Group gap="xs">
              <AppButton intent="secondary" size="xs" onClick={onCancelAutoAssign}>
                キャンセル
              </AppButton>
              <AppButton
                intent="primary"
                size="xs"
                disabled={autoAssignDates.size === 0}
                onClick={onOpenAutoAssignModal}
              >
                条件設定
              </AppButton>
            </Group>
          </>
        ) : (
          <AppButton
            intent="secondary"
            size="xs"
            leftSection={<IconWand size={14} />}
            onClick={onStartAutoAssign}
          >
            自動割当
          </AppButton>
        )}
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
            'data-selected': selected || undefined,
            'data-staged': stagedCells.has(cellKey(date, activeShiftTypeId)) || undefined,
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
        onDayClick={(date) => {
          if (autoAssignMode) {
            onToggleAutoAssignDate(date);
            return;
          }
          onSelectCell({ date, shiftTypeId: activeShiftTypeId });
        }}
        onEventClick={(event) => {
          const date = event.payload?.date;
          if (typeof date === 'string') {
            onSelectCell({ date, shiftTypeId: activeShiftTypeId });
          }
        }}
        renderEvent={(event, props) => {
          const payload = event.payload;
          return payload?.kind === 'description' ? (
            <Box style={props.style} className={classes.descriptionLayer}>
              <Tooltip label={payload.description} multiline maw={320} withArrow>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  color="gray"
                  size="sm"
                  className={classes.descriptionIcon}
                  aria-label={`備考: ${payload.description}`}
                  onClick={() =>
                    onSelectCell({
                      date: payload.date,
                      shiftTypeId: activeShiftTypeId,
                    })
                  }
                >
                  <IconMessage size={14} stroke={1.75} />
                </ActionIcon>
              </Tooltip>
            </Box>
          ) : (
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
  availabilityStatusByInstructor: Map<string, 'SUBMITTED' | 'NOT_SUBMITTED' | 'NOT_LINKED'>;
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
  availabilityStatusByInstructor,
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
                  availabilityStatus={availabilityStatusByInstructor.get(instructor.id)}
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
  availabilityStatus: 'SUBMITTED' | 'NOT_SUBMITTED' | 'NOT_LINKED' | undefined;
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
  availabilityStatus,
}: InstructorCardProps) {
  const isConflict = conflictLabel !== undefined;
  const isUnavailable = availability?.type === 'UNAVAILABLE';
  const isDisabled = (isConflict || isUnavailable) && !checked;
  const availabilityLabel =
    availability?.type === 'AVOID'
      ? `回避希望${availability.note ? `: ${availability.note}` : ''}`
      : availability?.type === 'UNAVAILABLE'
        ? `勤務不可${availability.note ? `: ${availability.note}` : ''}`
        : availabilityStatus === 'NOT_LINKED'
          ? '未連携'
          : availabilityStatus === 'NOT_SUBMITTED'
            ? '未入力（userリンク済み・申告なし）'
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
                      回避希望
                    </AppBadge>
                  )}
                  {availability?.type === 'UNAVAILABLE' && (
                    <AppBadge kind="pending" size="xs">
                      勤務不可
                    </AppBadge>
                  )}
                  {!availability && availabilityStatus === 'NOT_SUBMITTED' && (
                    <AppBadge kind="inactive" size="xs">
                      未入力
                    </AppBadge>
                  )}
                  {!availability && availabilityStatus === 'NOT_LINKED' && (
                    <AppBadge kind="inactive" size="xs">
                      未連携
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
