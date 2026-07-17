import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import { useBlocker } from '@tanstack/react-router';

import 'dayjs/locale/ja';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { useMe } from '@/features/auth/queries';
import { useAvailabilities } from '@/features/availabilities/queries';
import type { Availability } from '@/features/availabilities/schema';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { DepartmentTag } from '@/features/departments/DepartmentTag';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import type { AutoAssignSolver } from '../auto-assign-solver-port';
import { createWorkerSolver } from '../auto-assign-worker-solver';
import {
  useAutoAssignContext,
  useShiftAssignmentEditor,
  useShiftCalendar,
  useShiftCreationContext,
  useUpsertAssignments,
} from '../queries';
import type { AutoAssignProposal, AvailableInstructor, ShiftViewItem } from '../schema';
import { addDays, shortDateLabel, todayString, toMonth, weekdayIndex } from '../view-utils';
import { calculateFairShare, countCurrentMonthWorkDays, type CellAssignment } from '../workload';
import { applyAutoAssignProposals } from './auto-assign-stage';
import {
  reconcileShiftManagerSelection,
  type ShiftManagerSelection,
} from './shift-manager-selection';
import classes from './ShiftManager.module.css';

const DEPARTMENT_STORAGE_KEY = 'fuyugyo.shiftManage.departmentCode';
const ASSIGNMENT_DRAWER_HEIGHT = '55vh';

/**
 * 自動割当の生成器。呼び出し口はポート（{@link AutoAssignSolver}）越しに固定してあるため、
 * 将来 AI 割当へ移行する際はこの1行を別実装（例: サーバー AI ソルバー）へ差し替えるだけで済む。
 */
const autoAssignSolver: AutoAssignSolver = createWorkerSolver();

type CandidateSortMode = 'kana' | 'workload';

type SelectedCell = ShiftManagerSelection;

/** 月次まとめ登録のステージ状態（cellKey → 変更内容） */
type StagedCell = {
  instructorIds: string[];
  description: string;
};

/** 部門・対象月変更をユーザー承認で確定するための保留アクション */
type PendingNavigation =
  | { type: 'department'; nextDepartmentCode: DepartmentCode }
  | { type: 'month'; nextMonth: string }
  | { type: 'shiftType'; nextShiftTypeId: string };

/** シフト枠（日付 × 部門 × シフト種別）を月間シフト表で編集する管理コンポーネント。 */
export function ShiftManager() {
  const [month, setMonth] = useState(toMonth(todayString()));
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('ski');
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [stagedCells, setStagedCells] = useState<Map<string, StagedCell>>(new Map());
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  const [autoAssignMode, setAutoAssignMode] = useState(false);
  const [autoAssignDates, setAutoAssignDates] = useState<Set<string>>(new Set());
  const [autoAssignModalOpened, setAutoAssignModalOpened] = useState(false);
  const [autoAssignShiftTypeId, setAutoAssignShiftTypeId] = useState('');
  const [weekdayRequiredCount, setWeekdayRequiredCount] = useState(2);
  const [weekendHolidayRequiredCount, setWeekendHolidayRequiredCount] = useState(5);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  // 「別の案を出す」で異なる提案を得るための連番。実行のたびに増やす。
  const [autoAssignVariant, setAutoAssignVariant] = useState(0);
  const [shortageByCell, setShortageByCell] = useState<Map<string, AutoAssignProposal['shortage']>>(
    new Map(),
  );
  const selectedDayElementRef = useRef<HTMLElement | null>(null);
  // ステージ済みセルの Instructor 名を解決するためのローカルレジストリ。
  // 月次ビューと編集パネルの候補で見た Instructor を蓄積する。
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  const formData = useShiftCreationContext(departmentCode);
  const monthly = useShiftCalendar(month);
  const autoAssignContext = useAutoAssignContext(departmentCode, month);
  const monthEnd = monthLastDate(month);
  const availabilities = useAvailabilities(`${month}-01`, monthEnd);
  const upsertMonthly = useUpsertAssignments();
  const me = useMe();
  const days = useMemo(() => monthDays(month), [month]);
  const isDirty = stagedCells.size > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === 'blocked') {
      setPendingNav(null);
    }
  }, [blocker.status]);

  const activeShiftTypeId = selectedCell?.shiftTypeId ?? formData.data?.shiftTypes[0]?.id ?? '';
  // シフト種別タブに「未保存の編集あり」のドットを出すため、ステージ済みセルの種別IDを集計する
  const stagedShiftTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of stagedCells.keys()) {
      ids.add(splitCellKey(key)[1]);
    }
    return ids;
  }, [stagedCells]);

  const registerInstructorNames = useCallback((entries: Array<{ id: string; name: string }>) => {
    setNameById((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const entry of entries) {
        if (next.get(entry.id) !== entry.name) {
          next.set(entry.id, entry.name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!monthly.data) {
      return;
    }
    const entries = monthly.data.shifts.flatMap((shift) =>
      shift.assignedInstructors.map((inst) => ({ id: inst.id, name: inst.displayName })),
    );
    if (entries.length > 0) {
      registerInstructorNames(entries);
    }
  }, [monthly.data, registerInstructorNames]);

  useEffect(() => {
    if (!formData.data) {
      return;
    }

    const stored = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
    const storedDepartment = departmentCodeSchema.safeParse(stored);
    setDepartmentCode(storedDepartment.success ? storedDepartment.data : 'ski');
  }, [formData.data]);

  useEffect(() => {
    if (departmentCode) {
      window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, departmentCode);
    }
  }, [departmentCode]);

  useEffect(() => {
    setSelectedCell((current) => {
      const next = reconcileShiftManagerSelection({
        selection: current,
        days,
        shiftTypeIds: formData.data?.shiftTypes.map((shiftType) => shiftType.id) ?? [],
      });
      return current?.date === next?.date && current?.shiftTypeId === next?.shiftTypeId
        ? current
        : next;
    });
  }, [days, formData.data]);

  const applyNavigation = useCallback(
    (nav: PendingNavigation) => {
      if (nav.type === 'department') {
        setDepartmentCode(nav.nextDepartmentCode);
      } else if (nav.type === 'month') {
        setMonth(nav.nextMonth);
      } else {
        setSelectedCell((current) => ({
          date: current?.date ?? days[0] ?? todayString(),
          shiftTypeId: nav.nextShiftTypeId,
        }));
      }
      setStagedCells(new Map());
      setDrawerOpened(false);
    },
    [days],
  );

  /** 画面内の表示切り替えを要求する。dirty ならモーダルで確認、そうでなければ即時適用する。 */
  const requestNavigation = useCallback(
    (nav: PendingNavigation) => {
      if (!isDirty) {
        applyNavigation(nav);
        return;
      }
      setPendingNav(nav);
    },
    [applyNavigation, isDirty],
  );

  const confirmNavigation = () => {
    if (blocker.status === 'blocked') {
      blocker.proceed?.();
    } else if (pendingNav) {
      applyNavigation(pendingNav);
    }
    setPendingNav(null);
  };

  const cancelNavigation = () => {
    setPendingNav(null);
    blocker.reset?.();
  };

  const stageCell = useCallback((cellKey: string, next: StagedCell) => {
    setStagedCells((prev) => {
      const map = new Map(prev);
      map.set(cellKey, next);
      return map;
    });
  }, []);

  const resetStage = () => setStagedCells(new Map());

  const startAutoAssign = () => {
    setAutoAssignShiftTypeId(activeShiftTypeId);
    setAutoAssignDates(
      new Set(
        days.filter(
          (date) =>
            !monthly.data?.shifts.some(
              (shift) =>
                shift.date === date &&
                shift.department.code === departmentCode &&
                shift.shiftType.id === activeShiftTypeId &&
                shift.assignedInstructors.length > 0,
            ),
        ),
      ),
    );
    setAutoAssignMode(true);
  };

  const runAutoAssign = async () => {
    if (!autoAssignContext.data || !autoAssignShiftTypeId || autoAssignDates.size === 0) return;
    setIsAutoAssigning(true);
    const variant = autoAssignVariant;
    setAutoAssignVariant((current) => current + 1);
    try {
      const { proposals } = await autoAssignSolver({
        context: autoAssignContext.data,
        params: {
          shiftTypeId: autoAssignShiftTypeId,
          weekdayRequiredCount,
          weekendHolidayRequiredCount,
          targetDates: [...autoAssignDates],
          holidayDates: [],
        },
        variant,
      });
      setStagedCells((current) => applyAutoAssignProposals({ stagedCells: current, proposals }));
      setShortageByCell(
        new Map(
          proposals.map((proposal) => [
            cellKey(proposal.date, proposal.shiftTypeId),
            proposal.shortage,
          ]),
        ),
      );
      setAutoAssignModalOpened(false);
      setAutoAssignMode(false);
    } catch {
      // 失敗時はステージを変更せず、モーダルを開いたまま再試行を許す。
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // タブ切替: 選択中の日付は維持したままシフト種別だけを切り替える
  const changeActiveShiftType = useCallback(
    (shiftTypeId: string) => {
      if (shiftTypeId === activeShiftTypeId) return;
      requestNavigation({ type: 'shiftType', nextShiftTypeId: shiftTypeId });
    },
    [activeShiftTypeId, requestNavigation],
  );

  const openAssignmentDrawer = useCallback((cell: SelectedCell) => {
    setSelectedCell(cell);
    selectedDayElementRef.current = document.querySelector<HTMLElement>(
      `[data-shift-date="${cell.date}"]`,
    );
    setDrawerOpened(true);
  }, []);

  // 最終週を選んだ場合も、ボトムドロワーより上に選択行が残る位置まで先に移動する。
  useLayoutEffect(() => {
    if (!drawerOpened || !selectedDayElementRef.current) {
      return;
    }
    const rect = selectedDayElementRef.current.getBoundingClientRect();
    const drawerHeight = window.innerHeight * 0.55;
    const visibleBottom = window.innerHeight - drawerHeight - 16;
    if (rect.bottom > visibleBottom) {
      window.scrollBy({ top: rect.bottom - visibleBottom });
    }
  }, [drawerOpened, selectedCell]);

  // instructorId → 競合先の表示ラベル（「部門名 / シフト種別名」）。
  // DB 保存値ではなく「フォームの現在値」（ステージ済み優先）で判定することで、
  // 未保存の編集や空シフト状態でも同日の二重割り当てを防げるようにする。
  const conflictLabelById = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedCell || !departmentCode || !formData.data) {
      return map;
    }
    const { date, shiftTypeId } = selectedCell;
    const deptName = getDepartmentAppearance(departmentCode).label;

    const add = (ids: string[], label: string) => {
      for (const id of ids) {
        if (!map.has(id)) {
          map.set(id, label);
        }
      }
    };

    // (a) 現部門・同日の他シフト種別: ステージ値優先、無ければ保存値。編集中セルは除外。
    for (const st of formData.data.shiftTypes) {
      if (st.id === shiftTypeId) {
        continue;
      }
      const staged = stagedCells.get(cellKey(date, st.id));
      const ids = staged
        ? staged.instructorIds
        : (monthly.data?.shifts
            .find(
              (s) =>
                s.date === date && s.department.code === departmentCode && s.shiftType.id === st.id,
            )
            ?.assignedInstructors.map((i) => i.id) ?? []);
      add(ids, `${deptName} / ${st.name}`);
    }

    // (b) 他部門・同日の保存済みシフト（他部門はこの画面で編集できないため保存値のみ）。
    for (const s of monthly.data?.shifts ?? []) {
      if (s.date !== date || s.department.code === departmentCode) {
        continue;
      }
      add(
        s.assignedInstructors.map((i) => i.id),
        `${s.department.name} / ${s.shiftType.name}`,
      );
    }
    return map;
  }, [selectedCell, departmentCode, formData.data, stagedCells, monthly.data]);

  // Instructor 別の当月勤務日数（全部門横断・現部門はステージ済み編集を反映）。
  // 月単位でまとめて編集する UI 特性上、保存前の変更も負荷バーへ即座に反映するため、
  // ステージ状態が変わるたびにここで再計算する（API へは問い合わせない）。
  const currentMonthWorkDays = useMemo(() => {
    const savedAssignments: CellAssignment[] = (monthly.data?.shifts ?? []).map((shift) => ({
      date: shift.date,
      departmentCode: shift.department.code,
      shiftTypeId: shift.shiftType.id,
      instructorIds: shift.assignedInstructors.map((i) => i.id),
    }));
    const stagedAssignments: CellAssignment[] = Array.from(stagedCells.entries()).map(
      ([key, cell]) => {
        const [date, shiftTypeId] = splitCellKey(key);
        return { date, departmentCode, shiftTypeId, instructorIds: cell.instructorIds };
      },
    );
    return countCurrentMonthWorkDays(savedAssignments, stagedAssignments);
  }, [monthly.data, stagedCells, departmentCode]);

  const saveMonthly = () => {
    if (!departmentCode || stagedCells.size === 0) {
      return;
    }
    const cells = Array.from(stagedCells.entries()).map(([key, value]) => {
      const [date, shiftTypeId] = splitCellKey(key);
      return {
        date,
        shiftTypeId,
        description: value.description.trim() || null,
        instructorIds: value.instructorIds,
      };
    });
    upsertMonthly.mutate(
      { month, departmentCode, cells },
      {
        onSuccess: () => {
          setStagedCells(new Map());
        },
      },
    );
  };

  const selectedStagedCell = selectedCell
    ? stagedCells.get(cellKey(selectedCell.date, selectedCell.shiftTypeId))
    : undefined;
  const selectedServerShift = selectedCell
    ? monthly.data?.shifts.find(
        (shift) =>
          shift.date === selectedCell.date &&
          shift.department.code === departmentCode &&
          shift.shiftType.id === selectedCell.shiftTypeId,
      )
    : undefined;
  const selectedAssignmentCount =
    selectedStagedCell?.instructorIds.length ??
    selectedServerShift?.assignedInstructors.length ??
    0;

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
          value={departmentCode}
          onChange={(value) => {
            if (!value || value === departmentCode) {
              return;
            }
            const parsed = departmentCodeSchema.safeParse(value);
            if (parsed.success) {
              requestNavigation({ type: 'department', nextDepartmentCode: parsed.data });
            }
          }}
          renderOption={({ option }) => <DepartmentTag code={option.value} name={option.label} />}
          leftSection={(() => {
            const SelectedIcon = getDepartmentAppearance(departmentCode).icon;
            return <SelectedIcon size={16} stroke={1.75} />;
          })()}
          allowDeselect={false}
          w={{ base: '100%', sm: 280 }}
        />
      </Group>

      {formData.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {formData.isError && <ErrorAlert>フォームデータの取得に失敗しました</ErrorAlert>}
      {monthly.isError && (
        <ErrorAlert>{monthly.error?.message ?? '月次シフトの取得に失敗しました'}</ErrorAlert>
      )}

      {formData.data && (
        <>
          {isDirty && (
            <UnsavedChangesBar
              count={stagedCells.size}
              description="表示中の月のシフト割当をまとめて保存します"
              loading={upsertMonthly.isPending}
              saveLabel="一括保存"
              onCancel={resetStage}
              onSave={saveMonthly}
            />
          )}

          {upsertMonthly.isError && (
            <ErrorAlert>{upsertMonthly.error?.message ?? '保存に失敗しました'}</ErrorAlert>
          )}

          <ShiftCalendar
            month={month}
            onMonthChange={(nextMonth) =>
              requestNavigation({ type: 'month', nextMonth: toMonth(nextMonth) })
            }
            days={days}
            departmentCode={departmentCode}
            shiftTypes={formData.data.shiftTypes}
            activeShiftTypeId={selectedCell?.shiftTypeId ?? formData.data.shiftTypes[0]?.id ?? ''}
            onChangeShiftType={changeActiveShiftType}
            stagedShiftTypeIds={stagedShiftTypeIds}
            shifts={monthly.data?.shifts ?? []}
            stagedCells={stagedCells}
            nameById={nameById}
            selectedCell={drawerOpened ? selectedCell : null}
            myInstructorId={me.data?.instructorId ?? null}
            onSelectCell={openAssignmentDrawer}
            autoAssignMode={autoAssignMode}
            autoAssignDates={autoAssignDates}
            onStartAutoAssign={startAutoAssign}
            onCancelAutoAssign={() => setAutoAssignMode(false)}
            onToggleAutoAssignDate={(date) =>
              setAutoAssignDates((current) => {
                const next = new Set(current);
                if (next.has(date)) next.delete(date);
                else next.add(date);
                return next;
              })
            }
            onOpenAutoAssignModal={() => setAutoAssignModalOpened(true)}
            shortageByCell={shortageByCell}
          />

          {drawerOpened && <Box h={ASSIGNMENT_DRAWER_HEIGHT} aria-hidden />}

          <Drawer
            opened={drawerOpened}
            onClose={() => setDrawerOpened(false)}
            position="bottom"
            size={ASSIGNMENT_DRAWER_HEIGHT}
            title={
              selectedCell ? (
                <Group justify="space-between" wrap="nowrap" w="100%">
                  <Stack gap={0}>
                    <Text fw={600}>{shortDateLabel(selectedCell.date)}</Text>
                    <Text size="xs" c="dimmed" fw={400}>
                      {formData.data.shiftTypes.find(
                        (shiftType) => shiftType.id === selectedCell.shiftTypeId,
                      )?.name ?? ''}
                    </Text>
                  </Stack>
                  <Group gap="xs" wrap="nowrap" mr="xs">
                    <Text size="sm" c="dimmed">
                      {selectedAssignmentCount}名
                    </Text>
                    {selectedStagedCell && <AppBadge kind="pending">未保存</AppBadge>}
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
                key={`${selectedCell.date}-${departmentCode}-${selectedCell.shiftTypeId}`}
                date={selectedCell.date}
                departmentCode={departmentCode}
                shiftTypeId={selectedCell.shiftTypeId}
                stagedCell={stagedCells.get(cellKey(selectedCell.date, selectedCell.shiftTypeId))}
                onStageChange={(next) =>
                  stageCell(cellKey(selectedCell.date, selectedCell.shiftTypeId), next)
                }
                onRegisterInstructorNames={registerInstructorNames}
                conflictLabelById={conflictLabelById}
                currentMonthWorkDays={currentMonthWorkDays}
                availabilities={availabilities.data ?? []}
                availabilityStatusByInstructor={
                  new Map(
                    (autoAssignContext.data?.instructors ?? []).map((instructor) => [
                      instructor.id,
                      instructor.availabilityStatus,
                    ]),
                  )
                }
              />
            )}
          </Drawer>
        </>
      )}

      <Modal
        opened={pendingNav !== null || blocker.status === 'blocked'}
        onClose={cancelNavigation}
        title="未保存の変更があります"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            未保存の変更が {stagedCells.size} 件あります。 このまま
            {pendingNav?.type === 'department'
              ? '部門を切り替える'
              : pendingNav?.type === 'month'
                ? '対象月を変更する'
                : pendingNav?.type === 'shiftType'
                  ? 'シフト種別を切り替える'
                  : '別のページへ移動する'}
            と、これらの変更は破棄されます。
          </Text>
          <Group justify="flex-end" gap="xs">
            <AppButton intent="secondary" onClick={cancelNavigation}>
              キャンセル
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={confirmNavigation}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={autoAssignModalOpened}
        onClose={() => !isAutoAssigning && setAutoAssignModalOpened(false)}
        title="自動割当の条件"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {formData.data?.shiftTypes.find((shiftType) => shiftType.id === autoAssignShiftTypeId)
              ?.name ?? ''}{' '}
            を{autoAssignDates.size}日分、現在のステージへ直接反映します。
          </Text>
          <Select
            label="対象シフト種別"
            value={autoAssignShiftTypeId}
            onChange={(value) => value && setAutoAssignShiftTypeId(value)}
            data={
              formData.data?.shiftTypes.map((shiftType) => ({
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
              value={weekdayRequiredCount}
              onChange={(value) => setWeekdayRequiredCount(typeof value === 'number' ? value : 0)}
            />
            <NumberInput
              label="土日祝の人数"
              min={0}
              value={weekendHolidayRequiredCount}
              onChange={(value) =>
                setWeekendHolidayRequiredCount(typeof value === 'number' ? value : 0)
              }
            />
          </Group>
          <Text size="xs" c="dimmed">
            必要資格は表示・判定に使用します。変更はシフト種別設定画面で行ってください。
          </Text>
          <AppButton intent="tertiary" component="a" href="/shift-types" size="xs">
            必要資格設定を開く
          </AppButton>
          {autoAssignContext.data?.frames.find(
            (frame) => frame.shiftTypeId === autoAssignShiftTypeId,
          )?.certificationTiers.length === 0 && (
            <ErrorAlert>この種別には必要資格が設定されていないため、提案できません。</ErrorAlert>
          )}
          <AppButton
            intent={shortageByCell.size > 0 ? 'secondary' : 'primary'}
            leftSection={<IconWand size={16} />}
            onClick={runAutoAssign}
            loading={isAutoAssigning}
            disabled={!autoAssignContext.data || autoAssignDates.size === 0}
          >
            {shortageByCell.size > 0 ? '別の案を出す' : '提案をステージへ反映'}
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
          return {
            'data-shift-date': date,
            'data-selected': selected || undefined,
            'data-staged': stagedCells.has(cellKey(date, activeShiftTypeId)) || undefined,
            'aria-label': `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekdayLabel(date)}）の割り当てを編集`,
            style: {
              color:
                weekdayIndex(date) === 0
                  ? 'var(--mantine-color-red-7)'
                  : weekdayIndex(date) === 6
                    ? 'var(--mantine-color-blue-7)'
                    : undefined,
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

  useEffect(() => {
    if (!editData.data) {
      return;
    }
    onRegisterInstructorNames(
      editData.data.availableInstructors.map((inst) => ({
        id: inst.id,
        name: inst.displayName,
      })),
    );
  }, [editData.data, onRegisterInstructorNames]);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<CandidateSortMode>('kana');

  // 表示・編集対象の割り当て内容: stagedCell 優先、無ければサーバー state。
  const stagedInstructorIds = stagedCell?.instructorIds;
  const serverInstructorIds = editData.data?.shift?.assignedInstructorIds;
  const displayedDescription = stagedCell?.description ?? editData.data?.shift?.description ?? '';
  const selectedSet = useMemo(
    () => new Set(stagedInstructorIds ?? serverInstructorIds ?? []),
    [stagedInstructorIds, serverInstructorIds],
  );

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
      .sort(
        sortMode === 'workload'
          ? (a, b) =>
              (loadByInstructor.get(a.id) ?? 0) - (loadByInstructor.get(b.id) ?? 0) ||
              compareInstructorKana(a, b)
          : compareInstructorKana,
      );
  }, [editData.data?.availableInstructors, search, sortMode, loadByInstructor]);

  const availabilityByInstructor = useMemo(
    () =>
      new Map(
        availabilities
          .filter((availability) => availability.date === date)
          .map((availability) => [availability.instructorId, availability]),
      ),
    [availabilities, date],
  );

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
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
          ? '入力不能（user未連携）'
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
                      入力不能
                    </AppBadge>
                  )}
                </Group>
                {instructor.certifications.length > 0 && (
                  <Group gap={4} wrap="wrap">
                    {instructor.certifications.map((cert, index) => (
                      <AppBadge
                        key={index}
                        kind="certification"
                        departmentCode={departmentCode}
                        size="xs"
                      >
                        {cert}
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

function monthDays(month: string): string[] {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${month}-${day}`;
  });
}

/** 指定月の最終日を YYYY-MM-DD で返す。 */
function monthLastDate(month: string): string {
  const days = monthDays(month);
  return days.at(-1) ?? `${month}-01`;
}

function cellKey(date: string, shiftTypeId: string): string {
  return `${date}:${shiftTypeId}`;
}

function splitCellKey(key: string): [string, string] {
  const idx = key.indexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

function weekdayLabel(date: string): string {
  return ['日', '月', '火', '水', '木', '金', '土'][weekdayIndex(date)] ?? '';
}

function compareInstructorKana(a: AvailableInstructor, b: AvailableInstructor): number {
  const aKey = a.displayNameKana ?? a.displayName;
  const bKey = b.displayNameKana ?? b.displayName;
  return aKey.localeCompare(bKey, 'ja-JP');
}

function parseCandidateSortMode(value: string): CandidateSortMode {
  return value === 'workload' ? 'workload' : 'kana';
}
