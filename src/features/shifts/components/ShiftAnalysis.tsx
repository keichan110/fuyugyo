import { Fragment, useId, useState } from 'react';

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
import type { AutoAssignProposal } from '../schema';
import { deriveStaffingStatus, describeStaffing, type StaffingMonthlySummary } from '../staffing';
import { getCalendarDayColor, shortDateLabel, weekdayIndex } from '../view-utils';
import type { DayAssignments } from './calendar-events';
import type { SelectedCell } from './shift-manager-types';
import { cellKey } from './shift-manager-utils';
import classes from './ShiftManager.module.css';

type ShiftAnalysisProps = {
  month: string;
  departmentCode: DepartmentCode;
  shiftTypeName: string;
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
  | 'focusedInstructor'
  | 'days'
  | 'assignmentsByDay'
  | 'navigationDisabled'
  | 'onClearInstructor'
  | 'onSelectDate'
>;

/** 選んだ人だけの当月の配置日を並べ、連日・週末の配置を見比べられるようにする。 */
function InstructorPlacementAnalysis({
  focusedInstructor,
  days,
  assignmentsByDay,
  navigationDisabled,
  onClearInstructor,
  onSelectDate,
}: InstructorPlacementAnalysisProps) {
  if (!focusedInstructor)
    return (
      <Text size="sm" c="dimmed">
        編集フォームの「分析」から人を選択してください。
      </Text>
    );
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {focusedInstructor.name}の当月の配置
        </Text>
        <AppButton intent="secondary" size="compact-sm" onClick={onClearInstructor}>
          人の選択を解除
        </AppButton>
      </Group>
      <Box
        className={classes.personTimeline}
        role="group"
        aria-label={`${focusedInstructor.name}の当月の配置日。日付を押すと枠を編集できます`}
      >
        {days.map((date) => {
          const assigned =
            assignmentsByDay.get(date)?.some((person) => person.id === focusedInstructor.id) ??
            false;
          const weekday = weekdayIndex(date);
          return (
            <AppButton
              key={date}
              intent="secondary"
              className={classes.timelineDay}
              data-assigned={assigned || undefined}
              data-weekend={weekday === 0 || weekday === 6 || undefined}
              aria-label={`${shortDateLabel(date)}、${assigned ? '配置あり' : '配置なし'}の枠を編集`}
              disabled={navigationDisabled}
              onClick={() => onSelectDate(date)}
            >
              <Stack gap={2} align="center">
                <Text component="span" size="xs" c={getCalendarDayColor(date) ?? 'dimmed'}>
                  {Number(date.slice(8))}
                </Text>
                <Text component="span" size="xs">
                  {assigned ? '●' : '―'}
                </Text>
              </Stack>
            </AppButton>
          );
        })}
      </Box>
      <Text size="xs" c="dimmed">
        ●
        は表示中の部門・種別への配置です。当月内の並びを示しています。月をまたぐ連勤や、他部門・他種別での勤務は含みません。
      </Text>
    </Stack>
  );
}
