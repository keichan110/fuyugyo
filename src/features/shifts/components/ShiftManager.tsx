import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';

import {
  useShiftAssignmentEditor,
  useShiftCalendar,
  useShiftCreationContext,
  useUpsertAssignments,
} from '../queries';
import type { AvailableInstructor, ShiftViewItem } from '../schema';
import { addMonths, shortDateLabel, todayString, toMonth, weekdayIndex } from '../view-utils';

const DEPARTMENT_STORAGE_KEY = 'fuyugyo.shiftManage.departmentId';

/**
 * 月マトリクス／割り当てパネルの共通高さ。
 * AppShell ヘッダー（60）＋ Main と Container の padding（32）＋
 * タイトル行と部門セレクタ（〜150）＋ 下部余白（〜18）を差し引き、
 * ページ全体をビューポート内に収める。
 */
const PANEL_HEIGHT = 'calc(100vh - 260px)';

type CandidateSortMode = 'kana' | 'workload';

type SelectedCell = {
  date: string;
  shiftTypeId: string;
};

/** 月次まとめ登録のステージ状態（cellKey → 変更内容） */
type StagedCell = {
  instructorIds: string[];
  description: string;
};

/** 部門・対象月変更をユーザー承認で確定するための保留アクション */
type PendingNavigation =
  { type: 'department'; nextDepartmentId: string } | { type: 'month'; nextMonth: string };

/** シフト枠（日付 × 部門 × シフト種別）を月マトリクスで編集する管理コンポーネント。 */
export function ShiftManager() {
  const [month, setMonth] = useState(toMonth(todayString()));
  const [departmentId, setDepartmentId] = useState('');
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [stagedCells, setStagedCells] = useState<Map<string, StagedCell>>(new Map());
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  // ステージ済みセルの Instructor 名を解決するためのローカルレジストリ。
  // 月次ビューと編集パネルの候補で見た Instructor を蓄積する。
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  const formData = useShiftCreationContext();
  const monthly = useShiftCalendar(month);
  const upsertMonthly = useUpsertAssignments();
  const days = useMemo(() => monthDays(month), [month]);
  const isDirty = stagedCells.size > 0;

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
    if (!formData.data || departmentId) {
      return;
    }

    const stored = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
    const storedDepartment = formData.data.departments.find((dept) => dept.id === stored);
    setDepartmentId(storedDepartment?.id ?? formData.data.departments[0]?.id ?? '');
  }, [departmentId, formData.data]);

  useEffect(() => {
    if (departmentId) {
      window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, departmentId);
    }
  }, [departmentId]);

  useEffect(() => {
    const firstDay = days[0];
    const firstShiftType = formData.data?.shiftTypes[0];
    if (!firstDay || !firstShiftType) {
      return;
    }
    if (!selectedCell || !selectedCell.date.startsWith(month)) {
      setSelectedCell({ date: firstDay, shiftTypeId: firstShiftType.id });
      return;
    }
    if (!formData.data?.shiftTypes.some((shiftType) => shiftType.id === selectedCell.shiftTypeId)) {
      setSelectedCell({ date: selectedCell.date, shiftTypeId: firstShiftType.id });
    }
  }, [days, formData.data, month, selectedCell]);

  /** 部門・対象月の遷移を要求する。dirty ならモーダルで確認、そうでなければ即時適用。 */
  const requestNavigation = useCallback(
    (nav: PendingNavigation) => {
      if (!isDirty) {
        applyNavigation(nav);
        return;
      }
      setPendingNav(nav);
    },
    [isDirty],
  );

  const applyNavigation = (nav: PendingNavigation) => {
    if (nav.type === 'department') {
      setDepartmentId(nav.nextDepartmentId);
    } else {
      setMonth(nav.nextMonth);
    }
    setStagedCells(new Map());
  };

  const confirmNavigation = () => {
    if (pendingNav) {
      applyNavigation(pendingNav);
    }
    setPendingNav(null);
  };

  const cancelNavigation = () => setPendingNav(null);

  const stageCell = useCallback((cellKey: string, next: StagedCell) => {
    setStagedCells((prev) => {
      const map = new Map(prev);
      map.set(cellKey, next);
      return map;
    });
  }, []);

  const resetStage = () => setStagedCells(new Map());

  // instructorId → 競合先の表示ラベル（「部門名 / シフト種別名」）。
  // DB 保存値ではなく「フォームの現在値」（ステージ済み優先）で判定することで、
  // 未保存の編集や空シフト状態でも同日の二重割り当てを防げるようにする。
  const conflictLabelById = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedCell || !departmentId || !formData.data) {
      return map;
    }
    const { date, shiftTypeId } = selectedCell;
    const deptName = formData.data.departments.find((d) => d.id === departmentId)?.name ?? '';

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
                s.date === date && s.department.id === departmentId && s.shiftType.id === st.id,
            )
            ?.assignedInstructors.map((i) => i.id) ?? []);
      add(ids, `${deptName} / ${st.name}`);
    }

    // (b) 他部門・同日の保存済みシフト（他部門はこの画面で編集できないため保存値のみ）。
    for (const s of monthly.data?.shifts ?? []) {
      if (s.date !== date || s.department.id === departmentId) {
        continue;
      }
      add(
        s.assignedInstructors.map((i) => i.id),
        `${s.department.name} / ${s.shiftType.name}`,
      );
    }
    return map;
  }, [selectedCell, departmentId, formData.data, stagedCells, monthly.data]);

  const saveMonthly = () => {
    if (!departmentId || stagedCells.size === 0) {
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
      { month, departmentId, cells },
      {
        onSuccess: () => {
          setStagedCells(new Map());
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>シフト管理</Title>
        <Group gap="xs" align="flex-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestNavigation({ type: 'month', nextMonth: addMonths(month, -1) })}
          >
            前月
          </Button>
          <TextInput
            type="month"
            label="対象月"
            value={month}
            onChange={(e) => requestNavigation({ type: 'month', nextMonth: e.currentTarget.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestNavigation({ type: 'month', nextMonth: addMonths(month, 1) })}
          >
            次月
          </Button>
        </Group>
      </Group>

      {formData.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {formData.isError && <Alert color="red">フォームデータの取得に失敗しました</Alert>}
      {monthly.isError && (
        <Alert color="red">{monthly.error?.message ?? '月次シフトの取得に失敗しました'}</Alert>
      )}

      {formData.data && (
        <>
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <Select
              label="部門"
              data={formData.data.departments.map((dept) => ({
                value: dept.id,
                label: dept.name,
              }))}
              value={departmentId || null}
              onChange={(value) => {
                if (!value || value === departmentId) {
                  return;
                }
                requestNavigation({ type: 'department', nextDepartmentId: value });
              }}
              allowDeselect={false}
              w={{ base: '100%', sm: 280 }}
            />
            <Group gap="xs">
              {isDirty && (
                <Text size="sm" c="orange">
                  未保存の変更 {stagedCells.size} 件
                </Text>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={resetStage}
                disabled={!isDirty || upsertMonthly.isPending}
              >
                リセット
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveMonthly}
                loading={upsertMonthly.isPending}
                disabled={!isDirty}
              >
                月次を保存
              </Button>
            </Group>
          </Group>

          {upsertMonthly.isError && (
            <Alert color="red">{upsertMonthly.error?.message ?? '保存に失敗しました'}</Alert>
          )}

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" style={{ alignItems: 'start' }}>
            <ShiftMatrix
              days={days}
              departmentId={departmentId}
              shiftTypes={formData.data.shiftTypes}
              shifts={monthly.data?.shifts ?? []}
              stagedCells={stagedCells}
              nameById={nameById}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
            />
            {/* 左右の高さを PANEL_HEIGHT で揃え、内部スクロールで画面内に収める */}
            <Box style={{ height: PANEL_HEIGHT }}>
              {selectedCell && departmentId ? (
                <AssignmentPanel
                  key={`${selectedCell.date}-${departmentId}-${selectedCell.shiftTypeId}`}
                  date={selectedCell.date}
                  departmentId={departmentId}
                  shiftTypeId={selectedCell.shiftTypeId}
                  shiftTypeName={
                    formData.data.shiftTypes.find((st) => st.id === selectedCell.shiftTypeId)
                      ?.name ?? ''
                  }
                  stagedCell={stagedCells.get(cellKey(selectedCell.date, selectedCell.shiftTypeId))}
                  onStageChange={(next) =>
                    stageCell(cellKey(selectedCell.date, selectedCell.shiftTypeId), next)
                  }
                  onRegisterInstructorNames={registerInstructorNames}
                  conflictLabelById={conflictLabelById}
                />
              ) : (
                <Card withBorder padding="md" radius="md" style={{ height: '100%' }}>
                  <Text c="dimmed" size="sm">
                    セルを選択してください
                  </Text>
                </Card>
              )}
            </Box>
          </SimpleGrid>
        </>
      )}

      <Modal
        opened={pendingNav !== null}
        onClose={cancelNavigation}
        title="編集中の内容を破棄しますか？"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            未保存の変更が {stagedCells.size} 件あります。 このまま
            {pendingNav?.type === 'department' ? '部門を切り替える' : '対象月を変更する'}
            と、これらの変更は破棄されます。
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={cancelNavigation}>
              キャンセル
            </Button>
            <Button color="red" onClick={confirmNavigation}>
              破棄して切り替え
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

type ShiftTypeOption = {
  id: string;
  name: string;
};

type ShiftMatrixProps = {
  days: string[];
  departmentId: string;
  shiftTypes: ShiftTypeOption[];
  shifts: ShiftViewItem[];
  stagedCells: Map<string, StagedCell>;
  nameById: Map<string, string>;
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
};

/** 日付 × シフト種別の割り当てマトリクス（日付を縦軸に配置）。 */
function ShiftMatrix({
  days,
  departmentId,
  shiftTypes,
  shifts,
  stagedCells,
  nameById,
  selectedCell,
  onSelectCell,
}: ShiftMatrixProps) {
  // (date, shiftTypeId) → 対象部門のサーバー状態 Shift のマップ
  const shiftByCell = useMemo(() => {
    const map = new Map<string, ShiftViewItem>();
    for (const shift of shifts) {
      if (shift.department.id === departmentId) {
        map.set(cellKey(shift.date, shift.shiftType.id), shift);
      }
    }
    return map;
  }, [departmentId, shifts]);

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      style={{ height: PANEL_HEIGHT, display: 'flex', flexDirection: 'column' }}
    >
      <Text fw={500} mb="sm">
        月マトリクス
      </Text>
      {/* テーブルを内部スクロールにし、Thead は stickyHeader でスクロール中も列見出しを維持する */}
      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Table
          stickyHeader
          stickyHeaderOffset={0}
          withColumnBorders
          withTableBorder
          verticalSpacing={2}
          horizontalSpacing={2}
          style={{ tableLayout: 'fixed' }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={64} bg="gray.0">
                <Text size="xs" ta="center" fw={500}>
                  日付
                </Text>
              </Table.Th>
              {shiftTypes.map((shiftType) => (
                <Table.Th key={shiftType.id} bg="gray.0">
                  <Text size="xs" ta="center" fw={500}>
                    {shiftType.name}
                  </Text>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {days.map((day) => (
              <Table.Tr key={day}>
                <Table.Th>
                  <Stack gap={0} align="center">
                    <Text size="xs" fw={500}>
                      {day.slice(5).replace('-', '/')}
                    </Text>
                    <Text size="xs" c={weekdayColor(day)}>
                      {weekdayLabel(day)}
                    </Text>
                  </Stack>
                </Table.Th>
                {shiftTypes.map((shiftType) => {
                  const key = cellKey(day, shiftType.id);
                  const serverShift = shiftByCell.get(key);
                  const staged = stagedCells.get(key);
                  const selected =
                    selectedCell?.date === day && selectedCell.shiftTypeId === shiftType.id;
                  return (
                    <Table.Td key={shiftType.id} p={0}>
                      <ShiftCell
                        serverShift={serverShift}
                        staged={staged}
                        nameById={nameById}
                        selected={selected}
                        onClick={() => onSelectCell({ date: day, shiftTypeId: shiftType.id })}
                      />
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Card>
  );
}

type ShiftCellProps = {
  serverShift: ShiftViewItem | undefined;
  staged: StagedCell | undefined;
  nameById: Map<string, string>;
  selected: boolean;
  onClick: () => void;
};

/** 単一セル: 割り当て済み Instructor をバッジで列挙。stage 中は表示を staged 側で上書き。 */
function ShiftCell({ serverShift, staged, nameById, selected, onClick }: ShiftCellProps) {
  // staged があれば staged の割り当てを、そうでなければサーバー状態を表示する。
  // stage された Instructor 名はレジストリ（月次ビュー＋パネル候補で蓄積）から解決する
  const assignedNames = staged
    ? staged.instructorIds.map(
        (id) =>
          serverShift?.assignedInstructors.find((i) => i.id === id)?.displayName ??
          nameById.get(id) ??
          id,
      )
    : (serverShift?.assignedInstructors ?? []).map((i) => i.displayName);

  const hasAssignments = assignedNames.length > 0;

  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: 76,
        padding: 6,
        overflowY: 'auto',
        alignItems: hasAssignments ? 'flex-start' : 'center',
        justifyContent: hasAssignments ? 'flex-start' : 'center',
        alignContent: 'flex-start',
        flexWrap: 'wrap',
        gap: 4,
        backgroundColor: selected ? 'var(--mantine-color-blue-1)' : undefined,
      }}
    >
      {staged && (
        <Box
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--mantine-color-orange-6)',
          }}
        />
      )}
      {hasAssignments ? (
        assignedNames.map((name, idx) => (
          <Badge
            key={`${name}-${idx}`}
            size="xs"
            variant={selected ? 'filled' : 'light'}
            color={selected ? 'blue' : 'gray'}
          >
            {name}
          </Badge>
        ))
      ) : (
        <Text size="xs" c="dimmed">
          -
        </Text>
      )}
    </UnstyledButton>
  );
}

type AssignmentPanelProps = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
  shiftTypeName: string;
  stagedCell: StagedCell | undefined;
  onStageChange: (next: StagedCell) => void;
  onRegisterInstructorNames: (entries: Array<{ id: string; name: string }>) => void;
  /** instructorId → 競合先の表示ラベル（フォームの現在値ベースで親が算出） */
  conflictLabelById: Map<string, string>;
};

/**
 * 選択セルに連動する割り当て編集パネル。編集内容は親のステージに反映し、即時保存しない。
 * 表示・編集対象は props の stagedCell / editData から派生させ、
 * ローカル state は UI コントロール（検索・並び順）のみ持つ。これにより
 * セル切替やサーバー再取得のたびに props に確実に追随する。
 */
function AssignmentPanel({
  date,
  departmentId,
  shiftTypeId,
  shiftTypeName,
  stagedCell,
  onStageChange,
  onRegisterInstructorNames,
  conflictLabelById,
}: AssignmentPanelProps) {
  const editData = useShiftAssignmentEditor({ date, departmentId, shiftTypeId });

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
      .sort(sortMode === 'workload' ? compareInstructorWorkload : compareInstructorKana);
  }, [editData.data?.availableInstructors, search, sortMode]);

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
    <Card
      withBorder
      padding="md"
      radius="md"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* 候補リストが flex-grow で残余領域を占め、リスト内スクロールで画面全体は動かさない */}
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={500}>{shortDateLabel(date)}</Text>
            <Text size="sm" c="dimmed">
              {shiftTypeName}
            </Text>
          </div>
          {stagedCell && (
            <Badge color="orange" variant="light">
              未保存
            </Badge>
          )}
        </Group>

        {editData.isLoading && (
          <Text c="dimmed" size="sm">
            候補を読み込み中…
          </Text>
        )}
        {editData.isError && (
          <Alert color="red">{editData.error?.message ?? '候補の取得に失敗しました'}</Alert>
        )}

        {editData.data && (
          <>
            <TextInput
              label="名前検索"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <SegmentedControl
              size="xs"
              value={sortMode}
              onChange={(value) => setSortMode(parseCandidateSortMode(value))}
              data={[
                { value: 'kana', label: 'かな順' },
                { value: 'workload', label: '負荷が低い順' },
              ]}
            />

            <Stack gap="xs" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {candidates.length === 0 ? (
                <Text c="dimmed" size="sm">
                  候補がありません
                </Text>
              ) : (
                candidates.map((instructor) => (
                  <InstructorCheckbox
                    key={instructor.id}
                    instructor={instructor}
                    checked={selectedSet.has(instructor.id)}
                    onToggle={() => toggle(instructor.id)}
                    conflictLabel={conflictLabelById.get(instructor.id)}
                  />
                ))
              )}
            </Stack>

            <Textarea
              label="備考"
              value={displayedDescription}
              onChange={(e) => changeDescription(e.currentTarget.value)}
              maxLength={500}
              rows={3}
            />

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {selectedSet.size}名を割り当て（ステージ）
              </Text>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}

type InstructorCheckboxProps = {
  instructor: AvailableInstructor;
  checked: boolean;
  onToggle: () => void;
  /** 競合先（同日の別 Shift）の表示ラベル。未競合なら undefined */
  conflictLabel?: string | undefined;
};

/**
 * 割り当て候補インストラクターの1行。
 * 同日の別 Shift に割り当て済み（競合）かつ未チェックの場合は disabled にし、
 * 新規の二重割り当てを防ぐ（既存の割り当て解除はできるよう checked 時は除外）。
 */
function InstructorCheckbox({
  instructor,
  checked,
  onToggle,
  conflictLabel,
}: InstructorCheckboxProps) {
  const isConflict = conflictLabel !== undefined;
  const isDisabled = isConflict && !checked;

  return (
    <Tooltip label={`${conflictLabel}に割当済`} disabled={!isConflict} withArrow>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Checkbox
          checked={checked}
          onChange={onToggle}
          disabled={isDisabled}
          label={
            <Stack gap={0}>
              <Text size="sm">{instructor.displayName}</Text>
              <Text size="xs" c="dimmed">
                {instructor.displayNameKana ?? 'かな未登録'}
                {instructor.certificationSummary ? ` / ${instructor.certificationSummary}` : ''}
              </Text>
            </Stack>
          }
        />
        <Group gap={4} wrap="nowrap">
          <Tooltip label={workloadTooltip(instructor)} withArrow>
            <Badge
              color={instructor.workload.hasWarning ? 'orange' : 'gray'}
              variant="light"
              size="sm"
            >
              今月 {instructor.workload.monthlyWorkDays}日
              {instructor.workload.hasWarning ? ' ⚠' : ''}
            </Badge>
          </Tooltip>
        </Group>
      </Group>
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

/** 曜日インデックスから、日曜=赤・土曜=青・平日=dimmed の色トークンを返す。 */
function weekdayColor(date: string): 'red' | 'blue' | 'dimmed' {
  const index = weekdayIndex(date);
  if (index === 0) {
    return 'red';
  }
  if (index === 6) {
    return 'blue';
  }
  return 'dimmed';
}

function compareInstructorKana(a: AvailableInstructor, b: AvailableInstructor): number {
  const aKey = a.displayNameKana ?? a.displayName;
  const bKey = b.displayNameKana ?? b.displayName;
  return aKey.localeCompare(bKey, 'ja-JP');
}

function parseCandidateSortMode(value: string): CandidateSortMode {
  return value === 'workload' ? 'workload' : 'kana';
}

function compareInstructorWorkload(a: AvailableInstructor, b: AvailableInstructor): number {
  return (
    a.workload.monthlyWorkDays - b.workload.monthlyWorkDays ||
    a.workload.seasonWorkDays - b.workload.seasonWorkDays ||
    a.workload.consecutiveWeekends - b.workload.consecutiveWeekends ||
    a.workload.consecutiveWorkDays - b.workload.consecutiveWorkDays ||
    compareInstructorKana(a, b)
  );
}

function workloadTooltip(instructor: AvailableInstructor): string {
  const { workload } = instructor;
  return [
    `月内 ${workload.monthlyWorkDays}日`,
    `シーズン ${workload.seasonWorkDays}日`,
    `連続週末 ${workload.consecutiveWeekends}週`,
    `連続勤務 ${workload.consecutiveWorkDays}日`,
  ].join(' / ');
}
