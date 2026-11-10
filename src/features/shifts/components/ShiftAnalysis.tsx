import { useId, useMemo, type Ref } from 'react';

import {
  Accordion,
  ActionIcon,
  Box,
  Card,
  Collapse,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

import { WarningAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import type { Availability } from '@/features/availabilities/schema';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

import type { FrameComposition } from '../qualification-composition';
import { useInstructorWorkload } from '../queries';
import type { AutoAssignContext } from '../schema';
import { describeStaffing, type StaffingMonthlySummary } from '../staffing';
import { getCalendarDayColor, shortDateLabel, weekdayIndex } from '../view-utils';
import {
  classifyWorkDay,
  composeInstructorMonthWork,
  summarizeInstructorWorkload,
  type DetailedCellAssignment,
  type InstructorWorkloadSummary,
  type SeasonRange,
  type WorkDayKind,
  type WorkEntry,
} from '../workload';
import { AnalysisDateControls, AnalysisPersonControls } from './AnalysisSelectionControls';
import { buildAssignmentReview, type AssignmentReviewDay } from './assignment-review';
import { AssignmentReviewIssues } from './AssignmentReviewIssues';
import type { DayAssignments } from './calendar-events';
import { MonthlyAssignmentReview } from './MonthlyAssignmentReview';
import { MonthlyPlacementChart } from './MonthlyPlacementChart';
import { MonthlyStaffingSummary } from './MonthlyStaffingSummary';
import { QualificationChart, StaffingRateChart, WeeklyPlacementChart } from './PlacementCharts';
import type { SelectedCell } from './shift-manager-types';
import classes from './ShiftManager.module.css';

type ShiftAnalysisProps = {
  headingRef: Ref<HTMLHeadingElement>;
  opened: boolean;
  onOpenedChange: (opened: boolean) => void;
  onInspectDate: (date: string) => void;
  tab: string | null;
  onTabChange: (tab: string | null) => void;
  month: string;
  departmentCode: DepartmentCode;
  shiftTypeName: string;
  /** 表示中の種別 ID（タイムラインの ● と連勤の基準枠） */
  activeShiftTypeId: string;
  /** 当月の保存済み割り当て（全部門） */
  savedAssignments: DetailedCellAssignment[];
  /** 現部門のステージ済み（未保存）セル */
  stagedAssignments: DetailedCellAssignment[];
  context: AutoAssignContext | undefined;
  availabilities: Availability[] | undefined;
  reviewFailed: boolean;
  nameById: ReadonlyMap<string, string>;
  days: string[];
  assignmentsByDay: DayAssignments;
  assignmentsReady: boolean;
  staffingSummary: StaffingMonthlySummary | null;
  /** 日 → 資格構成の評価。自動割当コンテキストの取得前は null。 */
  compositionByDay: ReadonlyMap<string, FrameComposition> | null;
  navigationDisabled: boolean;
  requiredByDay: Map<string, number | null> | null;
  selectedCell: SelectedCell | null;
  /**
   * 連勤・連続勤務週数の基準日。利用者が日付を選んで枠を開いているときだけ渡し、
   * 未選択（既定で補われた選択のみ）の場合は null とする。
   */
  streakBaseDate: string | null;
  selectedDescription: string;
  focusedInstructor: { id: string; name: string } | null;
  onClearInstructor: () => void;
  onSelectInstructor: (person: { id: string; name: string }) => void;
  onSelectDate: (date: string) => void;
  onChangeDate: (date: string) => void;
  onClearDate: () => void;
};

/** 月全体・選択枠・人ごとの配置を、未保存の編集と同じ現在案で確認する分析領域。 */
export function ShiftAnalysis(props: ShiftAnalysisProps) {
  const opened = props.opened;
  const contentId = useId();
  const review = useMemo(
    () =>
      buildAssignmentReview({
        days: props.days,
        departmentCode: props.departmentCode,
        shiftTypeId: props.activeShiftTypeId,
        assignmentsByDay: props.assignmentsByDay,
        savedAssignments: props.savedAssignments,
        stagedAssignments: props.stagedAssignments,
        requiredByDay: props.requiredByDay,
        compositionByDay: props.compositionByDay,
        availabilities: props.availabilities,
        context: props.context,
      }),
    [
      props.days,
      props.departmentCode,
      props.activeShiftTypeId,
      props.assignmentsByDay,
      props.savedAssignments,
      props.stagedAssignments,
      props.requiredByDay,
      props.compositionByDay,
      props.availabilities,
      props.context,
    ],
  );
  const knownIds = new Set(props.context?.instructors.map((person) => person.id));
  const uncoveredNames = props.context
    ? [
        ...new Map(
          [...props.assignmentsByDay.values()]
            .flat()
            .filter((person) => !knownIds.has(person.id))
            .map((person) => [person.id, person.name]),
        ).values(),
      ]
    : [];

  return (
    <Card
      withBorder
      padding="md"
      component="section"
      aria-label="配置の分析"
      style={{ scrollMarginTop: 76 }}
    >
      <Group justify="space-between" mb={opened ? 'sm' : 0}>
        <Title
          ref={props.headingRef}
          order={3}
          size="h4"
          tabIndex={-1}
          style={{ scrollMarginTop: 76 }}
        >
          配置の分析
        </Title>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={opened ? '分析を閉じる' : '分析を開く'}
          aria-expanded={opened}
          aria-controls={contentId}
          onClick={() => props.onOpenedChange(!opened)}
        >
          {opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </ActionIcon>
      </Group>
      <Collapse expanded={opened} id={contentId}>
        <Text size="xs" c="dimmed" mb="sm">
          {Number(props.month.slice(0, 4))}年{Number(props.month.slice(5, 7))}月 /{' '}
          {getDepartmentAppearance(props.departmentCode).label} / {props.shiftTypeName}
          （未保存の編集を含む）
        </Text>
        {!props.assignmentsReady ? (
          <Text size="sm" c="dimmed">
            月間配置を読み込み中…
          </Text>
        ) : (
          <Tabs value={props.tab} onChange={props.onTabChange}>
            <Tabs.List>
              <Tabs.Tab value="month">月全体</Tabs.Tab>
              {props.selectedCell && (
                <Tabs.Tab value="slot">{shortDateLabel(props.selectedCell.date)}</Tabs.Tab>
              )}
              {props.focusedInstructor && (
                <Tabs.Tab value="person">{props.focusedInstructor.name}</Tabs.Tab>
              )}
            </Tabs.List>
            <Tabs.Panel value="month" pt="md">
              <Stack gap="md">
                <MonthlyStaffingSummary
                  days={props.days}
                  requiredByDay={props.requiredByDay}
                  assignmentsByDay={props.assignmentsByDay}
                />
                <MonthlyAssignmentReview
                  review={review}
                  ready={{
                    shortage: props.requiredByDay !== null,
                    availability: props.availabilities !== undefined,
                    streak: props.context !== undefined,
                    qualification: props.compositionByDay !== null,
                  }}
                  failed={props.reviewFailed}
                  unsetCount={props.staffingSummary?.unsetCount ?? null}
                  requirementUnset={
                    props.compositionByDay?.values().next().value?.requirementUnset ?? false
                  }
                  uncoveredNames={uncoveredNames}
                  navigationDisabled={props.navigationDisabled}
                  onSelectDate={props.onSelectDate}
                />
                <MonthlyPlacementChart
                  context={props.context}
                  shiftTypeId={props.activeShiftTypeId}
                  savedAssignments={props.savedAssignments}
                  stagedAssignments={props.stagedAssignments}
                  assignmentsByDay={props.assignmentsByDay}
                  nameById={props.nameById}
                  disabled={props.navigationDisabled}
                  onSelectInstructor={props.onSelectInstructor}
                />
              </Stack>
            </Tabs.Panel>
            {props.selectedCell && (
              <Tabs.Panel value="slot" pt="md">
                <SelectedSlotAnalysis
                  days={props.days}
                  navigationDisabled={props.navigationDisabled}
                  onChangeDate={props.onChangeDate}
                  onClearDate={props.onClearDate}
                  selectedCell={props.selectedCell}
                  review={review.find((day) => day.date === props.selectedCell?.date)}
                  assignmentsByDay={props.assignmentsByDay}
                  requiredByDay={props.requiredByDay}
                  compositionByDay={props.compositionByDay}
                  selectedDescription={props.selectedDescription}
                />
              </Tabs.Panel>
            )}
            {props.focusedInstructor && (
              <Tabs.Panel value="person" pt="md">
                <InstructorPlacementAnalysis
                  context={props.context}
                  onSelectInstructor={props.onSelectInstructor}
                  month={props.month}
                  departmentCode={props.departmentCode}
                  activeShiftTypeId={props.activeShiftTypeId}
                  savedAssignments={props.savedAssignments}
                  stagedAssignments={props.stagedAssignments}
                  streakBaseDate={props.streakBaseDate}
                  focusedInstructor={props.focusedInstructor}
                  days={props.days}
                  assignmentsByDay={props.assignmentsByDay}
                  navigationDisabled={props.navigationDisabled}
                  onClearInstructor={props.onClearInstructor}
                  onSelectDate={props.onInspectDate}
                />
              </Tabs.Panel>
            )}
          </Tabs>
        )}
      </Collapse>
    </Card>
  );
}

type SelectedSlotAnalysisProps = Pick<
  ShiftAnalysisProps,
  | 'selectedCell'
  | 'days'
  | 'navigationDisabled'
  | 'onChangeDate'
  | 'onClearDate'
  | 'assignmentsByDay'
  | 'requiredByDay'
  | 'compositionByDay'
  | 'selectedDescription'
> & { review: AssignmentReviewDay | undefined };

/** 選択枠の現在案の充足と要確認事項を示す。 */
function SelectedSlotAnalysis({
  days,
  navigationDisabled,
  onChangeDate,
  onClearDate,
  selectedCell,
  assignmentsByDay,
  requiredByDay,
  compositionByDay,
  selectedDescription,
  review,
}: SelectedSlotAnalysisProps) {
  if (!selectedCell)
    return (
      <Text size="sm" c="dimmed">
        カレンダーから日付を選択してください。
      </Text>
    );
  const assigned = assignmentsByDay.get(selectedCell.date) ?? [];
  const required = requiredByDay?.get(selectedCell.date) ?? null;
  const composition = compositionByDay?.get(selectedCell.date);
  return (
    <Stack gap="xs">
      <AnalysisDateControls
        date={selectedCell.date}
        days={days}
        disabled={navigationDisabled}
        onChangeDate={onChangeDate}
        onClearDate={onClearDate}
      />
      {review && review.issues.length > 0 && (
        <WarningAlert title="要確認">
          <AssignmentReviewIssues issues={review.issues} />
        </WarningAlert>
      )}
      <Text size="sm">
        {requiredByDay ? describeStaffing(required, assigned.length) : '必要人数を読み込み中…'}
      </Text>
      <StaffingRateChart required={required} assigned={assigned.length} />
      <Text size="sm">担当者：{assigned.map((person) => person.name).join('・') || '未配置'}</Text>
      {composition && <CompositionDetail composition={composition} />}
      {selectedDescription.trim() && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          備考：{selectedDescription}
        </Text>
      )}
    </Stack>
  );
}

/** 選択枠の資格構成（ランク別内訳・要件外の配置・要確認理由）を縦に並べる。 */
function CompositionDetail({ composition }: { composition: FrameComposition }) {
  if (composition.requirementUnset) return <Text size="sm">必要資格未設定</Text>;
  return (
    <Stack gap={4}>
      <Text fw={600} size="sm">
        資格構成
      </Text>
      <QualificationChart composition={composition} />
      {composition.outOfRequirementNames.length > 0 && (
        <Text size="sm">資格要件外の配置：{composition.outOfRequirementNames.join('・')}</Text>
      )}
      {!composition.needsReview && (
        <Text size="sm" c="dimmed">
          資格構成の要確認はありません
        </Text>
      )}
    </Stack>
  );
}

type InstructorPlacementAnalysisProps = Pick<
  ShiftAnalysisProps,
  | 'month'
  | 'departmentCode'
  | 'activeShiftTypeId'
  | 'savedAssignments'
  | 'stagedAssignments'
  | 'streakBaseDate'
  | 'focusedInstructor'
  | 'days'
  | 'assignmentsByDay'
  | 'navigationDisabled'
  | 'onClearInstructor'
  | 'onSelectInstructor'
  | 'context'
  | 'onSelectDate'
>;

/** 選んだ人の負荷（勤務日数・連勤・連続勤務週数）と、当月の配置を全部門・全種別で見比べる。 */
function InstructorPlacementAnalysis(props: InstructorPlacementAnalysisProps) {
  const { focusedInstructor } = props;
  if (!focusedInstructor)
    return (
      <Text size="sm" c="dimmed">
        編集フォームの「分析」から人を選択してください。
      </Text>
    );
  return <FocusedInstructorAnalysis {...props} focusedInstructor={focusedInstructor} />;
}

type FocusedInstructorAnalysisProps = Omit<
  InstructorPlacementAnalysisProps,
  'focusedInstructor'
> & {
  focusedInstructor: { id: string; name: string };
};

/** 「M/D」形式の短い日付 */
function monthDayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

/** 「YYYY/M/D」形式の日付 */
function fullDateLabel(date: string): string {
  return `${date.slice(0, 4)}/${monthDayLabel(date)}`;
}

/** 期間を「始点〜終点」で表す。同日なら1日だけ表示する */
function rangeLabel(from: string, to: string, format: (date: string) => string): string {
  return from === to ? format(from) : `${format(from)}〜${format(to)}`;
}

/** 勤務1件を「部門 / 種別」で表す */
function workEntryLabel(entry: WorkEntry): string {
  const department = getDepartmentAppearance(entry.departmentCode, entry.departmentName).label;
  return `${department} / ${entry.shiftTypeName}`;
}

/** タイムラインの代表アイコンの文字 */
const TIMELINE_ICON: Record<WorkDayKind, string> = {
  current: '●',
  sameDepartmentOtherType: '○',
  otherDepartment: '◆',
};

function FocusedInstructorAnalysis({
  context,
  assignmentsByDay,
  onSelectInstructor,
  month,
  departmentCode,
  activeShiftTypeId,
  savedAssignments,
  stagedAssignments,
  streakBaseDate,
  focusedInstructor,
  days,
  navigationDisabled,
  onClearInstructor,
  onSelectDate,
}: FocusedInstructorAnalysisProps) {
  const workload = useInstructorWorkload(focusedInstructor.id, month);
  const current = useMemo(
    () => ({ departmentCode, shiftTypeId: activeShiftTypeId }),
    [departmentCode, activeShiftTypeId],
  );
  const monthWork = useMemo(
    () => composeInstructorMonthWork(savedAssignments, stagedAssignments, focusedInstructor.id),
    [savedAssignments, stagedAssignments, focusedInstructor.id],
  );
  const summary = useMemo(
    () =>
      workload.data
        ? summarizeInstructorWorkload({
            monthWork,
            workDatesOutsideMonth: workload.data.workDatesOutsideMonth,
            season: workload.data.seasonRange,
            selectedDate: streakBaseDate,
          })
        : null,
    [workload.data, monthWork, streakBaseDate],
  );

  return (
    <Stack gap="sm">
      <AnalysisPersonControls
        person={focusedInstructor}
        context={context}
        shiftTypeId={activeShiftTypeId}
        assignmentsByDay={assignmentsByDay}
        disabled={navigationDisabled}
        onChangePerson={onSelectInstructor}
        onClearPerson={onClearInstructor}
      />
      {workload.isError ? (
        <Text size="sm" c="red">
          勤務日の取得に失敗しました。月外の勤務を含む数値を表示できません。
        </Text>
      ) : summary && workload.data ? (
        <WorkloadMetrics summary={summary} seasonRange={workload.data.seasonRange} month={month} />
      ) : (
        <Text size="sm" c="dimmed">
          勤務日を読み込み中…
        </Text>
      )}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          全部門・全種別
        </Text>
      </Group>
      <WeeklyPlacementChart days={days} monthWork={monthWork} current={current} />
      <Box
        className={classes.personTimeline}
        role="group"
        aria-label={`${focusedInstructor.name}の当月の勤務日。日付を押すと枠を編集できます`}
      >
        {days.map((date) => (
          <TimelineDay
            key={date}
            date={date}
            entries={monthWork.get(date)}
            current={current}
            disabled={navigationDisabled}
            onSelectDate={onSelectDate}
          />
        ))}
      </Box>
      <Accordion variant="default">
        <Accordion.Item value="scope">
          <Accordion.Control>
            <Text size="xs" c="dimmed">
              記号・集計条件
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Group gap="sm">
              <Text size="xs">● 表示中の部門・種別</Text>
              <Text size="xs">○ 同部門の別種別</Text>
              <Text size="xs">◆ 別部門</Text>
              <Text size="xs">— 勤務なし</Text>
            </Group>
            <Text size="xs" c="dimmed">
              対象範囲は全部門・全種別で、未保存の編集を含みます。週は月曜始まりで、1日でも勤務があれば勤務週です。連勤・連続勤務週数はシーズン内で数え、月をまたいでつなげます。
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

type WorkloadMetricsProps = {
  summary: InstructorWorkloadSummary;
  seasonRange: SeasonRange;
  month: string;
};

/** 現在案の勤務量と連続勤務を、数値中心のカードで表示する。 */
function WorkloadMetrics({ summary, seasonRange, month }: WorkloadMetricsProps) {
  const unselected = summary.selectedDate === null;
  const metrics = [
    { label: '当月', value: `${summary.monthDays}日`, detail: `${Number(month.slice(5, 7))}月` },
    {
      label: 'シーズン',
      value: `${summary.seasonDays}日`,
      detail: `${fullDateLabel(seasonRange.from)}〜${fullDateLabel(seasonRange.to)}`,
    },
    {
      label: '連勤',
      value: summary.streak ? `${summary.streak.days}日` : '—',
      detail: summary.streak
        ? rangeLabel(summary.streak.from, summary.streak.to, monthDayLabel)
        : unselected
          ? '日付を選択'
          : '選択日は勤務なし',
    },
    {
      label: '連続勤務',
      value: summary.weekStreak ? `${summary.weekStreak.weeks}週` : '—',
      detail: summary.weekStreak
        ? `${monthDayLabel(summary.weekStreak.fromWeekStart)}の週〜${monthDayLabel(summary.weekStreak.toWeekStart)}の週`
        : unselected
          ? '日付を選択'
          : '選択週は勤務なし',
    },
  ];
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
      {metrics.map((metric) => (
        <Card key={metric.label} withBorder padding="sm">
          <Text size="xs" c="dimmed">
            {metric.label}
          </Text>
          <Text size="xl" fw={700}>
            {metric.value}
          </Text>
          <Text size="xs" c="dimmed">
            {metric.detail}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  );
}

type TimelineDayProps = {
  date: string;
  entries: WorkEntry[] | undefined;
  current: { departmentCode: string; shiftTypeId: string };
  disabled: boolean;
  onSelectDate: (date: string) => void;
};

/** タイムラインの1日分。代表アイコンで勤務の種類を示し、読み上げでは全件の部門・種別を伝える。 */
function TimelineDay({ date, entries, current, disabled, onSelectDate }: TimelineDayProps) {
  const kind = classifyWorkDay(entries, current);
  const weekday = weekdayIndex(date);
  const workLabels =
    entries?.map((entry) =>
      classifyWorkDay([entry], current) === 'current'
        ? '配置あり'
        : `${workEntryLabel(entry)}に勤務`,
    ) ?? [];
  return (
    <AppButton
      intent="secondary"
      className={classes.timelineDay}
      data-assigned={kind === 'current' || undefined}
      data-weekend={weekday === 0 || weekday === 6 || undefined}
      aria-label={`${shortDateLabel(date)}、${workLabels.join('、') || '配置なし'}の枠を編集`}
      title={`${shortDateLabel(date)}：${workLabels.join('、') || '勤務なし'}`}
      disabled={disabled}
      onClick={() => onSelectDate(date)}
    >
      <Stack gap={2} align="center">
        <Text component="span" size="xs" c={getCalendarDayColor(date) ?? 'dimmed'}>
          {Number(date.slice(8))}
        </Text>
        <Text component="span" size="xs" c={timelineIconColor(kind, entries, current)}>
          {entries?.length
            ? entries.map((entry) => {
                const entryKind = classifyWorkDay([entry], current);
                return (
                  <Text
                    component="span"
                    key={`${entry.departmentCode}:${entry.shiftTypeId}`}
                    c={timelineIconColor(entryKind, [entry], current)}
                  >
                    {entryKind ? TIMELINE_ICON[entryKind] : '―'}
                  </Text>
                );
              })
            : '―'}
        </Text>
      </Stack>
    </AppButton>
  );
}

/** 別部門の勤務を代表とする日は、その部門の色でアイコンを描く */
function timelineIconColor(
  kind: WorkDayKind | null,
  entries: WorkEntry[] | undefined,
  current: { departmentCode: string },
): string {
  const otherDepartmentEntry = entries?.find((e) => e.departmentCode !== current.departmentCode);
  if (kind !== 'otherDepartment' || !otherDepartmentEntry) return 'inherit';
  return getDepartmentAppearance(
    otherDepartmentEntry.departmentCode,
    otherDepartmentEntry.departmentName,
  ).color;
}
