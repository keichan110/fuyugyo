import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBlocker } from '@tanstack/react-router';

import { useAvailabilities } from '@/features/availabilities/queries';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import type { AutoAssignSolver } from '../auto-assign-solver-port';
import { createWorkerSolver } from '../auto-assign-worker-solver';
import {
  useAutoAssignContext,
  useShiftCalendar,
  useShiftCreationContext,
  useShiftStaffingRequirements,
  useUpsertAssignments,
} from '../queries';
import type { ShiftViewItem } from '../schema';
import { summarizeStaffing } from '../staffing';
import { todayString, toMonth } from '../view-utils';
import { countCurrentMonthWorkDays, type CellAssignment } from '../workload';
import { applyAutoAssignProposals, contextWithStagedAssignments } from './auto-assign-stage';
import { resolveAssignmentsByDay } from './calendar-events';
import {
  applyBulkRequirements,
  stageRequirement as applyStagedRequirement,
  bulkRequirementTargetDates,
  countAutoAssignSelectableDates,
  effectiveRequiredCount,
  isAutoAssignSelectable,
  planAutoAssignTargets,
  type StagedRequirements,
} from './requirement-stage';
import { reconcileShiftManagerSelection } from './shift-manager-selection';
import type {
  PendingNavigation,
  SelectedCell,
  ShortageByCell,
  StagedCell,
} from './shift-manager-types';
import { cellKey, monthDays, monthLastDate, splitCellKey } from './shift-manager-utils';

const DEPARTMENT_STORAGE_KEY = 'fuyugyo.shiftManage.departmentCode';

/**
 * 自動割当の生成器。呼び出し口はポート（{@link AutoAssignSolver}）越しに固定してあるため、
 * 将来 AI 割当へ移行する際はこの1行を別実装（例: サーバー AI ソルバー）へ差し替えるだけで済む。
 */
const autoAssignSolver: AutoAssignSolver = createWorkerSolver();

/** ShiftManager の編集状態、データ取得、副作用、操作ハンドラーをまとめて提供する。 */
export function useShiftManagerController() {
  const [month, setMonth] = useState(() => toMonth(todayString()));
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>(() => {
    const stored = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
    const parsed = departmentCodeSchema.safeParse(stored);
    return parsed.success ? parsed.data : 'ski';
  });
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [assignmentPanelOpened, setAssignmentPanelOpened] = useState(false);
  const [stagedCells, setStagedCells] = useState<Map<string, StagedCell>>(new Map());
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  const [autoAssignMode, setAutoAssignMode] = useState(false);
  const [autoAssignDates, setAutoAssignDates] = useState<Set<string>>(new Set());
  // 一括設定の平日／土日祝の人数。空欄は 0 に丸めず '' で保持する。
  const [weekdayRequiredCount, setWeekdayRequiredCount] = useState<number | ''>(2);
  const [weekendHolidayRequiredCount, setWeekendHolidayRequiredCount] = useState<number | ''>(3);
  const [stagedRequirements, setStagedRequirements] = useState<StagedRequirements>(new Map());
  const [bulkModalOpened, setBulkModalOpened] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  // 「別の案を出す」で異なる提案を得るための連番。実行のたびに増やす。
  const [autoAssignVariant, setAutoAssignVariant] = useState(0);
  const [shortageByCell, setShortageByCell] = useState<ShortageByCell>(new Map());
  // ステージ済みセルの Instructor 名を解決するためのローカルレジストリ。
  // 月次ビューと編集パネルの候補で見た Instructor を蓄積する。
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  const formData = useShiftCreationContext(departmentCode);
  const monthly = useShiftCalendar(month);
  const autoAssignContext = useAutoAssignContext(departmentCode, month);
  const availabilities = useAvailabilities(`${month}-01`, monthLastDate(month));
  const requirements = useShiftStaffingRequirements(month);
  const upsertMonthly = useUpsertAssignments();
  const days = useMemo(() => monthDays(month), [month]);
  // 必要人数は取得できるまで未設定と区別できないため、取得完了を ready として扱う
  const requirementsReady = requirements.data !== undefined;
  const savedRequirements = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of requirements.data ?? []) {
      if (row.departmentCode === departmentCode) {
        map.set(cellKey(row.date, row.shiftTypeId), row.requiredCount);
      }
    }
    return map;
  }, [requirements.data, departmentCode]);
  const isDirty = stagedCells.size > 0 || stagedRequirements.size > 0;
  // 同じセルの割り当てと必要人数の両方が未保存でも1件として数える
  const dirtyCount = useMemo(
    () => new Set([...stagedCells.keys(), ...stagedRequirements.keys()]).size,
    [stagedCells, stagedRequirements],
  );
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

  const activeShiftTypeId = selectedCell?.shiftTypeId ?? formData.data?.shiftTypes[0]?.id ?? '';
  // シフト種別タブに「未保存の編集あり」のドットを出すため、ステージ済みセルの種別IDを集計する
  const stagedShiftTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of [...stagedCells.keys(), ...stagedRequirements.keys()]) {
      ids.add(splitCellKey(key)[1]);
    }
    return ids;
  }, [stagedCells, stagedRequirements]);

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
    if (!monthly.data) return;
    const entries = monthly.data.shifts.flatMap((shift) =>
      shift.assignedInstructors.map((inst) => ({ id: inst.id, name: inst.displayName })),
    );
    if (entries.length > 0) registerInstructorNames(entries);
  }, [monthly.data, registerInstructorNames]);

  // 自動割当の提案は保存済み勤務を持たない人も含むため、候補の表示名を先に登録しておく
  useEffect(() => {
    if (!autoAssignContext.data) return;
    registerInstructorNames(
      autoAssignContext.data.instructors.map((instructor) => ({
        id: instructor.id,
        name: instructor.displayName,
      })),
    );
  }, [autoAssignContext.data, registerInstructorNames]);

  useEffect(() => {
    window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, departmentCode);
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
      if (nav.type === 'department') setDepartmentCode(nav.nextDepartmentCode);
      else if (nav.type === 'month') setMonth(nav.nextMonth);
      else {
        setSelectedCell((current) => ({
          date: current?.date ?? days[0] ?? todayString(),
          shiftTypeId: nav.nextShiftTypeId,
        }));
      }
      setStagedCells(new Map());
      setStagedRequirements(new Map());
      setAssignmentPanelOpened(false);
      // 日付選択は表示中の部門・種別・月が前提なので、切り替えたら終了する
      setAutoAssignMode(false);
    },
    [days],
  );

  /** 画面内の表示切り替えを要求する。dirty ならモーダルで確認、そうでなければ即時適用する。 */
  const requestNavigation = useCallback(
    (nav: PendingNavigation) => {
      if (isAutoAssigning) return;
      if (!isDirty) {
        applyNavigation(nav);
        return;
      }
      setPendingNav(nav);
    },
    [applyNavigation, isDirty, isAutoAssigning],
  );

  const confirmNavigation = () => {
    if (blocker.status === 'blocked') blocker.proceed?.();
    else if (pendingNav) applyNavigation(pendingNav);
    setPendingNav(null);
  };
  const cancelNavigation = () => {
    setPendingNav(null);
    blocker.reset?.();
  };
  const stageCell = useCallback((cellKeyValue: string, next: StagedCell) => {
    setStagedCells((prev) => new Map(prev).set(cellKeyValue, next));
  }, []);
  const resetStage = () => {
    setStagedCells(new Map());
    setStagedRequirements(new Map());
  };
  const stageRequirement = useCallback(
    (date: string, shiftTypeId: string, requiredCount: number | null) => {
      setStagedRequirements((prev) =>
        applyStagedRequirement(prev, savedRequirements, cellKey(date, shiftTypeId), requiredCount),
      );
    },
    [savedRequirements],
  );

  // 表示中のシフト種別について、日ごとの表示用の必要人数（取得前は null 自体を返さない）
  const requiredByDay = useMemo(() => {
    if (!requirementsReady) return null;
    return new Map(
      days.map((date) => [
        date,
        effectiveRequiredCount(
          stagedRequirements,
          savedRequirements,
          cellKey(date, activeShiftTypeId),
        ),
      ]),
    );
  }, [requirementsReady, days, stagedRequirements, savedRequirements, activeShiftTypeId]);

  // 自動割当で選べるのは、実効値が1名以上の日だけ（未設定と0名は対象外）
  const isAutoAssignSelectableDate = useCallback(
    (date: string) =>
      isAutoAssignSelectable(stagedRequirements, savedRequirements, date, activeShiftTypeId),
    [stagedRequirements, savedRequirements, activeShiftTypeId],
  );

  // 必要人数の取得後に、選べる日が1日もないか（取得前は判定しない）
  const hasNoAutoAssignSelectableDates =
    requirementsReady &&
    countAutoAssignSelectableDates({
      dates: days,
      shiftTypeId: activeShiftTypeId,
      staged: stagedRequirements,
      saved: savedRequirements,
    }) === 0;

  const bulkTargetDates = useMemo(
    () =>
      bulkRequirementTargetDates({
        dates: days,
        shiftTypeId: activeShiftTypeId,
        staged: stagedRequirements,
        saved: savedRequirements,
      }),
    [days, activeShiftTypeId, stagedRequirements, savedRequirements],
  );
  const applyBulkRequirementCounts = () => {
    if (weekdayRequiredCount === '' || weekendHolidayRequiredCount === '') return;
    setStagedRequirements((prev) =>
      applyBulkRequirements({
        dates: days,
        shiftTypeId: activeShiftTypeId,
        staged: prev,
        saved: savedRequirements,
        counts: { weekday: weekdayRequiredCount, weekendHoliday: weekendHolidayRequiredCount },
      }),
    );
    setBulkModalOpened(false);
  };

  const startAutoAssign = () => {
    setAutoAssignDates(
      new Set(
        days.filter(
          (date) =>
            isAutoAssignSelectableDate(date) &&
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

  // 開いているシフト種別に必要資格がなければ提案できない（取得前は判定しない）
  const activeShiftTypeMissingCertification = autoAssignContext.data
    ? (autoAssignContext.data.frames.find((frame) => frame.shiftTypeId === activeShiftTypeId)
        ?.certificationTiers.length ?? 0) === 0
    : false;

  const runAutoAssign = async () => {
    if (
      !autoAssignContext.data ||
      !activeShiftTypeId ||
      !requirementsReady ||
      activeShiftTypeMissingCertification
    ) {
      return;
    }
    // 選択済みの日のうち、実効値が1名以上の日だけを対象にする
    const targets = planAutoAssignTargets({
      dates: autoAssignDates,
      shiftTypeId: activeShiftTypeId,
      staged: stagedRequirements,
      saved: savedRequirements,
    });
    // 対象が空なら既存の割り当てに触れず、ソルバーも呼ばない
    if (targets.targetDates.length === 0) return;
    setIsAutoAssigning(true);
    const variant = autoAssignVariant;
    setAutoAssignVariant((current) => current + 1);
    try {
      const { proposals } = await autoAssignSolver({
        context: contextWithStagedAssignments(autoAssignContext.data, stagedCells),
        params: { shiftTypeId: activeShiftTypeId, ...targets },
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
      setAutoAssignMode(false);
    } catch {
      // 失敗時はステージを変更せず、日付選択モードを維持して再試行を許す。
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const changeActiveShiftType = useCallback(
    (shiftTypeId: string) => {
      if (shiftTypeId !== activeShiftTypeId) {
        requestNavigation({ type: 'shiftType', nextShiftTypeId: shiftTypeId });
      }
    },
    [activeShiftTypeId, requestNavigation],
  );
  const openAssignmentPanel = useCallback((cell: SelectedCell) => {
    setSelectedCell(cell);
    setAssignmentPanelOpened(true);
  }, []);

  const conflictLabelById = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedCell || !formData.data) return map;
    const { date, shiftTypeId } = selectedCell;
    const deptName = getDepartmentAppearance(departmentCode).label;
    const add = (ids: string[], label: string) => {
      for (const id of ids) if (!map.has(id)) map.set(id, label);
    };
    for (const st of formData.data.shiftTypes) {
      if (st.id === shiftTypeId) continue;
      const staged = stagedCells.get(cellKey(date, st.id));
      const ids = staged
        ? staged.instructorIds
        : (monthly.data?.shifts
            .find(
              (shift) =>
                shift.date === date &&
                shift.department.code === departmentCode &&
                shift.shiftType.id === st.id,
            )
            ?.assignedInstructors.map((instructor) => instructor.id) ?? []);
      add(ids, `${deptName} / ${st.name}`);
    }
    for (const shift of monthly.data?.shifts ?? []) {
      if (shift.date !== date || shift.department.code === departmentCode) continue;
      add(
        shift.assignedInstructors.map((instructor) => instructor.id),
        `${shift.department.name} / ${shift.shiftType.name}`,
      );
    }
    return map;
  }, [selectedCell, departmentCode, formData.data, stagedCells, monthly.data]);

  const currentMonthWorkDays = useMemo(() => {
    const savedAssignments: CellAssignment[] = (monthly.data?.shifts ?? []).map((shift) => ({
      date: shift.date,
      departmentCode: shift.department.code,
      shiftTypeId: shift.shiftType.id,
      instructorIds: shift.assignedInstructors.map((instructor) => instructor.id),
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
    if (!isDirty) return;
    const cells = Array.from(stagedCells.entries()).map(([key, value]) => {
      const [date, shiftTypeId] = splitCellKey(key);
      return {
        date,
        shiftTypeId,
        description: value.description.trim() || null,
        instructorIds: value.instructorIds,
      };
    });
    const stagedRequirementInputs = Array.from(stagedRequirements.entries()).map(([key, value]) => {
      const [date, shiftTypeId] = splitCellKey(key);
      return { date, shiftTypeId, requiredCount: value.requiredCount };
    });
    upsertMonthly.mutate(
      { month, departmentCode, cells, requirements: stagedRequirementInputs },
      {
        onSuccess: () => {
          setStagedCells(new Map());
          setStagedRequirements(new Map());
        },
      },
    );
  };

  const shiftByCell = useMemo(() => {
    const map = new Map<string, ShiftViewItem>();
    for (const shift of monthly.data?.shifts ?? []) {
      if (shift.department.code === departmentCode) {
        map.set(cellKey(shift.date, shift.shiftType.id), shift);
      }
    }
    return map;
  }, [monthly.data, departmentCode]);
  const assignmentsByDay = useMemo(
    () =>
      resolveAssignmentsByDay({
        days,
        shiftTypeId: activeShiftTypeId,
        shiftByCell,
        stagedCells,
        nameById,
      }),
    [days, activeShiftTypeId, shiftByCell, stagedCells, nameById],
  );

  const staffingSummary = useMemo(
    () =>
      requiredByDay && monthly.data
        ? summarizeStaffing(
            days.map((date) => ({
              required: requiredByDay.get(date) ?? null,
              assigned: assignmentsByDay.get(date)?.length ?? 0,
            })),
          )
        : null,
    [requiredByDay, monthly.data, days, assignmentsByDay],
  );

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

  const selectedRequirementKey = selectedCell
    ? cellKey(selectedCell.date, selectedCell.shiftTypeId)
    : undefined;
  const selectedRequiredCount = selectedRequirementKey
    ? effectiveRequiredCount(stagedRequirements, savedRequirements, selectedRequirementKey)
    : null;

  return {
    assignmentsByDay,
    shiftByCell,
    staffingSummary,
    activeShiftTypeId,
    activeShiftTypeMissingCertification,
    isAutoAssignSelectableDate,
    hasNoAutoAssignSelectableDates,
    applyBulkRequirementCounts,
    bulkModalOpened,
    bulkTargetDates,
    dirtyCount,
    requiredByDay,
    requirements,
    requirementsReady,
    selectedRequiredCount,
    selectedStagedRequirement: selectedRequirementKey
      ? stagedRequirements.get(selectedRequirementKey)
      : undefined,
    setBulkModalOpened,
    stageRequirement,
    stagedRequirements,
    autoAssignContext,
    autoAssignDates,
    autoAssignMode,
    availabilities,
    blocker,
    cancelNavigation,
    changeActiveShiftType,
    confirmNavigation,
    conflictLabelById,
    currentMonthWorkDays,
    days,
    departmentCode,
    assignmentPanelOpened,
    formData,
    isAutoAssigning,
    isDirty,
    month,
    monthly,
    nameById,
    openAssignmentPanel,
    pendingNav,
    registerInstructorNames,
    requestNavigation,
    resetStage,
    runAutoAssign,
    saveMonthly,
    selectedAssignmentCount:
      selectedStagedCell?.instructorIds.length ??
      selectedServerShift?.assignedInstructors.length ??
      0,
    selectedCell,
    selectedStagedCell,
    setAutoAssignDates,
    setAutoAssignMode,
    setAssignmentPanelOpened,
    setWeekdayRequiredCount,
    setWeekendHolidayRequiredCount,
    shortageByCell,
    stageCell,
    stagedCells,
    stagedShiftTypeIds,
    startAutoAssign,
    upsertMonthly,
    weekdayRequiredCount,
    weekendHolidayRequiredCount,
  };
}
