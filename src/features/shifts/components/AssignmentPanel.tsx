import { useId, useMemo, useState, type ReactNode } from 'react';

import {
  Accordion,
  Box,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconAlertTriangleFilled,
  IconCalendarCheck,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleXFilled,
  IconMessage,
} from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';
import type { Availability } from '@/features/availabilities/schema';
import type { DepartmentCode } from '@/features/departments/schema';

import { groupAssignmentCandidates, type CandidateSortMode } from '../candidate-display';
import { useShiftAssignmentEditor } from '../queries';
import type { AvailableInstructor } from '../schema';
import { calculateFairShare } from '../workload';
import type { StagedCell } from './shift-manager-types';
import classes from './ShiftManager.module.css';

type AssignmentPanelProps = {
  readOnly: boolean;
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
  focusedInstructorId: string | null;
  onAnalyzeInstructor: (instructor: { id: string; name: string }) => void;
};

/**
 * 選択セルに連動する割り当て編集パネル。編集内容は親のステージに反映し、即時保存しない。
 * 表示・編集対象は props の stagedCell / editData から派生させ、
 * ローカル state は UI コントロール（検索・並び順）のみ持つ。これにより
 * セル切替やサーバー再取得のたびに props に確実に追随する。
 */
export function AssignmentPanel({
  readOnly,
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
  focusedInstructorId,
  onAnalyzeInstructor,
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

  const availabilityByInstructor = useMemo(() => {
    const byInstructor = new Map<string, Availability>();
    for (const availability of availabilities) {
      if (availability.date === date) {
        byInstructor.set(availability.instructorId, availability);
      }
    }
    return byInstructor;
  }, [availabilities, date]);

  const candidateGroups = useMemo(
    () =>
      groupAssignmentCandidates({
        candidates: editData.data?.availableInstructors ?? [],
        availabilityByInstructor,
        conflictLabelById,
        search,
        sortMode,
        loadByInstructor,
      }),
    [
      editData.data?.availableInstructors,
      availabilityByInstructor,
      conflictLabelById,
      search,
      sortMode,
      loadByInstructor,
    ],
  );

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

  const renderCandidate = (instructor: AvailableInstructor) => (
    <Box key={instructor.id} className={classes.candidateRow}>
      <InstructorCard
        instructor={instructor}
        departmentCode={departmentCode}
        readOnly={readOnly}
        checked={selectedSet.has(instructor.id)}
        onToggle={() => toggle(instructor.id)}
        conflictLabel={conflictLabelById.get(instructor.id)}
        load={loadByInstructor.get(instructor.id) ?? 0}
        fairShareAverage={fairShareAverage}
        maxAbsDeviation={maxAbsDeviation}
        availability={availabilityByInstructor.get(instructor.id)}
      />
      <AppButton
        intent="secondary"
        size="xs"
        px="xs"
        aria-label={`${instructor.displayName}の分析${focusedInstructorId === instructor.id ? 'を解除' : 'を表示'}`}
        aria-pressed={focusedInstructorId === instructor.id}
        onClick={() => onAnalyzeInstructor({ id: instructor.id, name: instructor.displayName })}
      >
        {focusedInstructorId === instructor.id ? '解除' : '分析'}
      </AppButton>
    </Box>
  );

  return (
    <Stack gap="md">
      <NumberInput
        label="必要人数"
        description="空欄は未設定です。0名は開講予定なしで、自動割当の対象外です（手動の割り当ては可能です）"
        allowDecimal={false}
        allowNegative={false}
        min={0}
        disabled={readOnly || !requirementsReady}
        value={requiredCount ?? ''}
        onChange={(value) => onRequiredCountChange(typeof value === 'number' ? value : null)}
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
              size="xs"
              fullWidth
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
              w="100%"
            />
          </Group>

          <Stack gap="sm" className={classes.candidateList} role="group" aria-label="割り当て候補">
            {candidateGroups.length === 0 ? (
              <Text c="dimmed" size="sm">
                候補がありません
              </Text>
            ) : (
              candidateGroups.map((group) =>
                group.type === 'UNAVAILABLE' ? (
                  <CollapsedCandidateGroup
                    type="UNAVAILABLE"
                    key={group.type}
                    count={group.candidates.length}
                    expanded={
                      search.trim().length > 0 ||
                      group.candidates.some((person) => selectedSet.has(person.id))
                    }
                  >
                    {group.candidates.map(renderCandidate)}
                  </CollapsedCandidateGroup>
                ) : group.type === 'ASSIGNED' ? (
                  <CollapsedCandidateGroup
                    key={group.type}
                    type="ASSIGNED"
                    count={group.candidates.length}
                    expanded={search.trim().length > 0}
                  >
                    {group.blocks.map((block) => (
                      <Stack
                        key={block.label}
                        gap="xs"
                        pl="xs"
                        role="group"
                        aria-label={`${block.label} ${block.candidates.length}名`}
                      >
                        <Text component="h4" size="xs" fw={600} m={0} c="dimmed">
                          {block.label}（{block.candidates.length}名）
                        </Text>
                        {block.candidates.map(renderCandidate)}
                      </Stack>
                    ))}
                  </CollapsedCandidateGroup>
                ) : (
                  <Stack
                    key={group.type}
                    gap="xs"
                    role="group"
                    aria-label={`${group.label} ${group.candidates.length}名`}
                  >
                    <Group gap={6} wrap="nowrap">
                      <CandidateGroupIcon type={group.type} />
                      <Text component="h3" size="sm" fw={700} m={0}>
                        {group.label}（{group.candidates.length}名）
                      </Text>
                    </Group>
                    {group.candidates.map(renderCandidate)}
                  </Stack>
                ),
              )
            )}
          </Stack>

          <Textarea
            readOnly={readOnly}
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

/** 勤務不可・配置済みの候補は通常閉じ、検索中など確認が必要なときに開いて示す。 */
function CollapsedCandidateGroup({
  type,
  count,
  expanded,
  children,
}: {
  type: 'UNAVAILABLE' | 'ASSIGNED';
  count: number;
  expanded: boolean;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Accordion
      value={expanded || opened ? 'unavailable' : null}
      onChange={(value) => setOpened(value !== null)}
      variant="default"
    >
      <Accordion.Item value="unavailable">
        <Accordion.Control>
          <Group gap={6}>
            <CandidateGroupIcon type={type} />
            <Text size="sm" fw={700}>
              {type === 'UNAVAILABLE' ? '勤務不可' : '配置済み'}（{count}名）
            </Text>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">{children}</Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

/** 本人の申告画面と同じアイコン・色でグループを示す。未入力は中立色にする。 */
function CandidateGroupIcon({ type }: { type: Availability['type'] | 'NOT_ENTERED' | 'ASSIGNED' }) {
  const appearance = {
    ASSIGNED: { Icon: IconCalendarCheck, color: 'var(--mantine-color-dimmed)' },
    AVAILABLE: { Icon: IconCircleCheckFilled, color: 'var(--mantine-color-green-6)' },
    NOT_ENTERED: { Icon: IconCircleDashed, color: 'var(--mantine-color-dimmed)' },
    AVOID: { Icon: IconAlertTriangleFilled, color: 'var(--mantine-color-yellow-8)' },
    UNAVAILABLE: { Icon: IconCircleXFilled, color: 'var(--mantine-color-red-6)' },
  };
  const { Icon, color } = appearance[type];
  return <Icon size={16} color={color} aria-hidden style={{ flexShrink: 0 }} />;
}

type InstructorCardProps = {
  readOnly: boolean;
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
  readOnly,
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
  const isDisabled = readOnly || ((isConflict || isUnavailable) && !checked);
  const descriptionId = useId();
  const qualificationId = useId();
  const hasNote = Boolean(availability?.note?.trim());

  return (
    <Checkbox.Card
      checked={checked}
      onClick={isDisabled ? undefined : onToggle}
      disabled={isDisabled}
      aria-label={instructor.displayName}
      aria-describedby={[qualificationId, hasNote || isConflict ? descriptionId : null]
        .filter(Boolean)
        .join(' ')}
      className={classes.instructorCard}
      h="100%"
    >
      <Stack gap={4}>
        <VisuallyHidden id={qualificationId}>
          対象資格:{' '}
          {instructor.certifications.map((certification) => certification.shortName).join('・') ||
            'なし'}
          {instructor.hasQualificationWarning ? '。資格外' : ''}
        </VisuallyHidden>
        <Group justify="space-between" gap="xs" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" align="center" flex={1} miw={0}>
            <Checkbox.Indicator disabled={isDisabled} />
            <InstructorDetails instructor={instructor} departmentCode={departmentCode} />
          </Group>
          <WorkloadDeviationBar
            load={load}
            average={fairShareAverage}
            maxAbsDeviation={maxAbsDeviation}
          />
        </Group>
        {(hasNote || isConflict) && (
          <Stack id={descriptionId} gap={2} className={classes.candidateDetails}>
            {hasNote && (
              <Group gap={4} align="flex-start" wrap="nowrap" c="dimmed">
                <IconMessage
                  size={14}
                  stroke={1.75}
                  aria-hidden
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <Text size="xs" c="dimmed" miw={0}>
                  <VisuallyHidden>コメント: </VisuallyHidden>
                  {availability?.note}
                </Text>
              </Group>
            )}
            {isConflict && <VisuallyHidden>同日配置済み: {conflictLabel}</VisuallyHidden>}
          </Stack>
        )}
      </Stack>
    </Checkbox.Card>
  );
}

/** 候補者の氏名・資格・注意を1行で表示し、長い情報は補足で確認できるようにする。 */
function InstructorDetails({
  instructor,
  departmentCode,
}: Pick<InstructorCardProps, 'instructor' | 'departmentCode'>) {
  const certifications = instructor.certifications.map((cert) => cert.shortName).join('・');

  return (
    <Group gap={4} wrap="nowrap" flex={1} miw={0}>
      <Tooltip
        label={[instructor.displayName, instructor.displayNameKana].filter(Boolean).join(' / ')}
        withArrow
      >
        <Text size="sm" fw={500} truncate flex={1} miw={0}>
          {instructor.displayName}
        </Text>
      </Tooltip>
      {certifications && (
        <Tooltip label={certifications} withArrow>
          <AppBadge
            kind="certification"
            muted
            departmentCode={departmentCode}
            size="xs"
            className={classes.candidateCertifications}
          >
            {certifications}
          </AppBadge>
        </Tooltip>
      )}
      {instructor.hasQualificationWarning && (
        <Text component="span" size="xs" c="yellow.8" style={{ flexShrink: 0 }}>
          資格外
        </Text>
      )}
    </Group>
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
      <Box pos="relative" w={40} h={8} bg="gray.2" bdrs={4} className={classes.deviationBarTrack}>
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
