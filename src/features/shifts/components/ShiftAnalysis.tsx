import { Fragment, useId, useMemo, useState } from 'react';

import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  Collapse,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

import { AppButton } from '@/components/AppButton';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

import type { FrameComposition } from '../qualification-composition';
import { useInstructorWorkload } from '../queries';
import type { AutoAssignProposal } from '../schema';
import { deriveStaffingStatus, describeStaffing, type StaffingMonthlySummary } from '../staffing';
import { getCalendarDayColor, shortDateLabel, weekdayIndex } from '../view-utils';
import {
  classifyWorkDay,
  composeInstructorMonthWork,
  summarizeInstructorWorkload,
  type DetailedCellAssignment,
  type WorkDayKind,
  type WorkEntry,
} from '../workload';
import type { DayAssignments } from './calendar-events';
import type { SelectedCell } from './shift-manager-types';
import { cellKey } from './shift-manager-utils';
import classes from './ShiftManager.module.css';

type ShiftAnalysisProps = {
  month: string;
  departmentCode: DepartmentCode;
  shiftTypeName: string;
  /** 表示中の種別 ID（タイムラインの ● と連勤の基準枠） */
  activeShiftTypeId: string;
  /** 当月の保存済み割り当て（全部門） */
  savedAssignments: DetailedCellAssignment[];
  /** 現部門のステージ済み（未保存）セル */
  stagedAssignments: DetailedCellAssignment[];
  days: string[];
  assignmentsByDay: DayAssignments;
  assignmentsReady: boolean;
  staffingSummary: StaffingMonthlySummary | null;
  shortageByCell: ReadonlyMap<string, AutoAssignProposal['shortage']>;
  /** 日 → 資格構成の評価。自動割当コンテキストの取得前は null。 */
  compositionByDay: ReadonlyMap<string, FrameComposition> | null;
  navigationDisabled: boolean;
  requiredByDay: Map<string, number | null> | null;
  selectedCell: SelectedCell | null;
  selectedDescription: string;
  focusedInstructor: { id: string; name: string } | null;
  onClearInstructor: () => void;
  onSelectDate: (date: string) => void;
};

/** 月全体・選択枠・人ごとの配置を、未保存の編集と同じ現在案で確認する分析領域。 */
export function ShiftAnalysis(props: ShiftAnalysisProps) {
  const [opened, setOpened] = useState(true);
  const [tab, setTab] = useState<string | null>(props.focusedInstructor ? 'person' : 'month');
  const contentId = useId();

  return (
    <Card withBorder padding="md" component="section" aria-label="配置の分析">
      <Group justify="space-between" mb={opened ? 'sm' : 0}>
        <Title order={3} size="h4">
          配置の分析
        </Title>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={opened ? '分析を閉じる' : '分析を開く'}
          aria-expanded={opened}
          aria-controls={contentId}
          onClick={() => setOpened((value) => !value)}
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
          <Tabs value={tab} onChange={setTab}>
            <Tabs.List>
              <Tabs.Tab value="month">月全体</Tabs.Tab>
              <Tabs.Tab value="slot">選択枠</Tabs.Tab>
              <Tabs.Tab value="person">選択した人</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="month" pt="md">
              <MonthlyStaffingAnalysis
                days={props.days}
                assignmentsByDay={props.assignmentsByDay}
                requiredByDay={props.requiredByDay}
                compositionByDay={props.compositionByDay}
                staffingSummary={props.staffingSummary}
                navigationDisabled={props.navigationDisabled}
                onSelectDate={(date) => {
                  props.onSelectDate(date);
                  setTab('slot');
                }}
              />
            </Tabs.Panel>
            <Tabs.Panel value="slot" pt="md">
              <SelectedSlotAnalysis
                selectedCell={props.selectedCell}
                assignmentsByDay={props.assignmentsByDay}
                requiredByDay={props.requiredByDay}
                shortageByCell={props.shortageByCell}
                compositionByDay={props.compositionByDay}
                selectedDescription={props.selectedDescription}
              />
            </Tabs.Panel>
            <Tabs.Panel value="person" pt="md">
              <InstructorPlacementAnalysis
                month={props.month}
                departmentCode={props.departmentCode}
                activeShiftTypeId={props.activeShiftTypeId}
                savedAssignments={props.savedAssignments}
                stagedAssignments={props.stagedAssignments}
                selectedCell={props.selectedCell}
                focusedInstructor={props.focusedInstructor}
                days={props.days}
                assignmentsByDay={props.assignmentsByDay}
                navigationDisabled={props.navigationDisabled}
                onClearInstructor={props.onClearInstructor}
                onSelectDate={props.onSelectDate}
              />
            </Tabs.Panel>
          </Tabs>
        )}
      </Collapse>
    </Card>
  );
}

type MonthlyStaffingAnalysisProps = Pick<
  ShiftAnalysisProps,
  | 'days'
  | 'assignmentsByDay'
  | 'requiredByDay'
  | 'compositionByDay'
  | 'staffingSummary'
  | 'navigationDisabled'
  | 'onSelectDate'
>;

/** 当月の不足を一覧し、選んだ枠の分析へ移動する。 */
function MonthlyStaffingAnalysis({
  days,
  assignmentsByDay,
  requiredByDay,
  compositionByDay,
  staffingSummary,
  navigationDisabled,
  onSelectDate,
}: MonthlyStaffingAnalysisProps) {
  if (!staffingSummary || !requiredByDay)
    return (
      <Text size="sm" c="dimmed">
        必要人数を読み込み中…
      </Text>
    );
  const shortDates = days.filter(
    (date) =>
      deriveStaffingStatus(
        requiredByDay.get(date) ?? null,
        assignmentsByDay.get(date)?.length ?? 0,
      ) === 'SHORT',
  );
  const reviewDates = days.filter((date) => compositionByDay?.get(date)?.needsReview);
  const requirementUnset = compositionByDay?.values().next().value?.requirementUnset ?? false;
  return (
    <Stack gap="sm">
      {requirementUnset && <Text size="sm">必要資格未設定</Text>}
      <Text size="sm">
        不足 {staffingSummary.shortDays}日 / 必要人数未設定 {staffingSummary.unsetCount}枠
      </Text>
      <DateLinkList
        dates={shortDates}
        actionLabel="不足を確認"
        disabled={navigationDisabled}
        onSelectDate={onSelectDate}
      />
      {staffingSummary.shortDays === 0 && (
        <Text size="sm" c="dimmed">
          必要人数が設定された枠に不足はありません。
        </Text>
      )}
      {compositionByDay && !requirementUnset && (
        <>
          <Text size="sm">資格構成の要確認 {reviewDates.length}日</Text>
          <DateLinkList
            dates={reviewDates}
            actionLabel="要確認を確認"
            disabled={navigationDisabled}
            onSelectDate={onSelectDate}
          />
        </>
      )}
    </Stack>
  );
}

type DateLinkListProps = {
  dates: string[];
  /** スクリーンリーダー向けに日付へ続ける操作の説明 */
  actionLabel: string;
  disabled: boolean;
  onSelectDate: (date: string) => void;
};

/** 日付と曜日だけのリンクを「、」区切りで並べ、押した日の枠へ移動する。 */
function DateLinkList({ dates, actionLabel, disabled, onSelectDate }: DateLinkListProps) {
  if (dates.length === 0) return null;
  return (
    <Text size="sm">
      {dates.map((date, index) => (
        <Fragment key={date}>
          {index > 0 && '、'}
          <Anchor
            component="button"
            type="button"
            size="sm"
            disabled={disabled}
            aria-label={`${shortDateLabel(date)}の${actionLabel}`}
            onClick={() => onSelectDate(date)}
          >
            {shortDateLabel(date)}
          </Anchor>
        </Fragment>
      ))}
    </Text>
  );
}

type SelectedSlotAnalysisProps = Pick<
  ShiftAnalysisProps,
  | 'selectedCell'
  | 'assignmentsByDay'
  | 'requiredByDay'
  | 'shortageByCell'
  | 'compositionByDay'
  | 'selectedDescription'
>;

/** 選択枠の現在の充足と、まだ不足している場合の自動割当時の理由を示す。 */
function SelectedSlotAnalysis({
  selectedCell,
  assignmentsByDay,
  requiredByDay,
  shortageByCell,
  compositionByDay,
  selectedDescription,
}: SelectedSlotAnalysisProps) {
  if (!selectedCell)
    return (
      <Text size="sm" c="dimmed">
        カレンダーから日付を選択してください。
      </Text>
    );
  const assigned = assignmentsByDay.get(selectedCell.date) ?? [];
  const required = requiredByDay?.get(selectedCell.date) ?? null;
  const isShort =
    requiredByDay !== null && deriveStaffingStatus(required, assigned.length) === 'SHORT';
  const composition = compositionByDay?.get(selectedCell.date);
  const shortage = isShort
    ? shortageByCell.get(cellKey(selectedCell.date, selectedCell.shiftTypeId))
    : undefined;
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {shortDateLabel(selectedCell.date)}
      </Text>
      <Text size="sm">
        {requiredByDay ? describeStaffing(required, assigned.length) : '必要人数を読み込み中…'}
      </Text>
      <Text size="sm">担当者：{assigned.map((person) => person.name).join('・') || '未配置'}</Text>
      {shortage && shortage.count > 0 && shortage.reasons.length > 0 && (
        <Text size="sm" c="yellow.8">
          自動割当時の不足理由：{shortage.reasons.join(' / ')}
        </Text>
      )}
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
      {composition.rankBreakdown.map((rank) => (
        <Text key={rank.tierRank} size="sm">
          {rank.certificationNames.join('・')}：{rank.count}名
          {rank.names.length > 0 && `（${rank.names.join('・')}）`}
        </Text>
      ))}
      <Text size="sm">
        必要資格を満たす人数 {composition.qualifiedCount} / 配置 {composition.assignedCount}名
      </Text>
      {composition.outOfRequirementNames.length > 0 && (
        <Text size="sm">資格要件外の配置：{composition.outOfRequirementNames.join('・')}</Text>
      )}
      {composition.needsReview ? (
        composition.reasons.map((reason) => (
          <Text key={reason} size="sm" c="yellow.8">
            要確認：{reason}
          </Text>
        ))
      ) : (
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
  | 'selectedCell'
  | 'focusedInstructor'
  | 'days'
  | 'assignmentsByDay'
  | 'navigationDisabled'
  | 'onClearInstructor'
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
  month,
  departmentCode,
  activeShiftTypeId,
  savedAssignments,
  stagedAssignments,
  selectedCell,
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
            selectedDate: selectedCell?.date ?? null,
            current,
          })
        : null,
    [workload.data, monthWork, selectedCell?.date, current],
  );
  const seasonRange = workload.data?.seasonRange;
  const additionPrefix = summary?.isAddition ? 'この枠に追加した場合：' : '';
  const monthNumber = Number(month.slice(5, 7));

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {focusedInstructor.name}の負荷
        </Text>
        <AppButton intent="secondary" size="compact-sm" onClick={onClearInstructor}>
          人の選択を解除
        </AppButton>
      </Group>
      {workload.isError ? (
        <Text size="sm" c="red">
          勤務日の取得に失敗しました。月外の勤務を含む数値を表示できません。
        </Text>
      ) : !summary ? (
        <Text size="sm" c="dimmed">
          勤務日を読み込み中…
        </Text>
      ) : (
        <Stack gap={4}>
          <Text size="sm">
            連勤：
            {summary.streak
              ? `${additionPrefix}${summary.streak.days}連勤（${rangeLabel(summary.streak.from, summary.streak.to, monthDayLabel)}）`
              : '枠を選択すると表示'}
          </Text>
          <Text size="sm">
            シーズン勤務日数：{summary.seasonDays}日
            {summary.isAddition && `（この枠に追加すると +${summary.addedDays}日）`}
            {seasonRange && (
              <Text component="span" size="xs" c="dimmed">
                {' '}
                シーズン {fullDateLabel(seasonRange.from)}〜{fullDateLabel(seasonRange.to)}
              </Text>
            )}
          </Text>
          <Text size="sm">
            当月勤務日数：{summary.monthDays}日（{monthNumber}月）
            {summary.isAddition && `（この枠に追加すると +${summary.addedDays}日）`}
          </Text>
          <Text size="sm">
            連続勤務週数：
            {summary.weekStreak
              ? `${additionPrefix}${summary.weekStreak.weeks}週連続（${monthDayLabel(summary.weekStreak.fromWeekStart)}の週${summary.weekStreak.weeks > 1 ? `〜${monthDayLabel(summary.weekStreak.toWeekStart)}の週` : ''}）`
              : '枠を選択すると表示'}
          </Text>
        </Stack>
      )}
      <Text size="xs" c="dimmed">
        対象範囲は全部門・全種別で、未保存の編集を含みます。週は月曜始まりで、1日でも勤務があれば勤務週です。連勤・連続勤務週数はシーズン内で数え、月をまたいでつなげます。自動割当は表示中の部門内の勤務日数で公平性を評価します。
      </Text>
      <Box
        className={classes.personTimeline}
        role="group"
        aria-label={`${focusedInstructor.name}の当月の勤務日。日付を押すと枠を編集できます`}
      >
        {days.map((date) => {
          const entries = monthWork.get(date);
          const kind = classifyWorkDay(entries, current);
          const weekday = weekdayIndex(date);
          const otherDepartmentEntry = entries?.find((e) => e.departmentCode !== departmentCode);
          const workLabels =
            entries?.map((entry) =>
              classifyWorkDay([entry], current) === 'current'
                ? '配置あり'
                : `${workEntryLabel(entry)}に勤務`,
            ) ?? [];
          return (
            <AppButton
              key={date}
              intent="secondary"
              className={classes.timelineDay}
              data-assigned={kind === 'current' || undefined}
              data-weekend={weekday === 0 || weekday === 6 || undefined}
              aria-label={`${shortDateLabel(date)}、${workLabels.length > 0 ? workLabels.join('、') : '配置なし'}の枠を編集`}
              disabled={navigationDisabled}
              onClick={() => onSelectDate(date)}
            >
              <Stack gap={2} align="center">
                <Text component="span" size="xs" c={getCalendarDayColor(date) ?? 'dimmed'}>
                  {Number(date.slice(8))}
                </Text>
                <Text
                  component="span"
                  size="xs"
                  c={
                    kind === 'otherDepartment' && otherDepartmentEntry
                      ? getDepartmentAppearance(
                          otherDepartmentEntry.departmentCode,
                          otherDepartmentEntry.departmentName,
                        ).color
                      : 'inherit'
                  }
                >
                  {kind ? TIMELINE_ICON[kind] : '―'}
                </Text>
              </Stack>
            </AppButton>
          );
        })}
      </Box>
      <Text size="xs" c="dimmed">
        ● 表示中の部門・種別 / ○ 同部門の別種別 / ◆ 別部門（部門色） / ―
        勤務なし。同日に複数ある場合は ● &gt; ◆ &gt; ○ の順で代表を表示します。
      </Text>
    </Stack>
  );
}
