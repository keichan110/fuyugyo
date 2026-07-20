import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  useUpsertAssignments,
} from '../queries';
import { todayString, toMonth } from '../view-utils';
import { countCurrentMonthWorkDays, type CellAssignment } from '../workload';
import { applyAutoAssignProposals } from './auto-assign-stage';
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
  const [shortageByCell, setShortageByCell] = useState<ShortageByCell>(new Map());
  const selectedDayElementRef = useRef<HTMLElement | null>(null);
  // ステージ済みセルの Instructor 名を解決するためのローカルレジストリ。
  // 月次ビューと編集パネルの候補で見た Instructor を蓄積する。
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  const formData = useShiftCreationContext(departmentCode);
  const monthly = useShiftCalendar(month);
  const autoAssignContext = useAutoAssignContext(departmentCode, month);
  const availabilities = useAvailabilities(`${month}-01`, monthLastDate(month));
  const upsertMonthly = useUpsertAssignments();
  const days = useMemo(() => monthDays(month), [month]);
  const isDirty = stagedCells.size > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

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
    if (!monthly.data) return;
    const entries = monthly.data.shifts.flatMap((shift) =>
      shift.assignedInstructors.map((inst) => ({ id: inst.id, name: inst.displayName })),
    );
    if (entries.length > 0) registerInstructorNames(entries);
  }, [monthly.data, registerInstructorNames]);

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

  const changeActiveShiftType = useCallback(
    (shiftTypeId: string) => {
      if (shiftTypeId !== activeShiftTypeId) {
        requestNavigation({ type: 'shiftType', nextShiftTypeId: shiftTypeId });
      }
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
    if (!drawerOpened || !selectedDayElementRef.current) return;
    const rect = selectedDayElementRef.current.getBoundingClientRect();
    const visibleBottom = window.innerHeight - window.innerHeight * 0.55 - 16;
    if (rect.bottom > visibleBottom) window.scrollBy({ top: rect.bottom - visibleBottom });
  }, [drawerOpened, selectedCell]);

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
    if (stagedCells.size === 0) return;
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
      { onSuccess: () => setStagedCells(new Map()) },
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

  return {
    activeShiftTypeId,
    autoAssignContext,
    autoAssignDates,
    autoAssignMode,
    autoAssignModalOpened,
    autoAssignShiftTypeId,
    availabilities,
    blocker,
    cancelNavigation,
    changeActiveShiftType,
    confirmNavigation,
    conflictLabelById,
    currentMonthWorkDays,
    days,
    departmentCode,
    drawerOpened,
    formData,
    isAutoAssigning,
    isDirty,
    month,
    monthly,
    nameById,
    openAssignmentDrawer,
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
    setAutoAssignModalOpened,
    setAutoAssignMode,
    setAutoAssignShiftTypeId,
    setDrawerOpened,
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
