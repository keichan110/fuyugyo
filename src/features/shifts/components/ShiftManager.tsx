import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  ScrollArea,
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
} from '@mantine/core';

import {
  useMonthlyView,
  useShiftEditData,
  useShiftFormData,
  useUpsertAssignmentSet,
} from '../queries';
import type { AvailableInstructor, ShiftViewItem } from '../schema';
import { addMonths, shortDateLabel, todayString, toMonth, weekdayIndex } from '../view-utils';

const DEPARTMENT_STORAGE_KEY = 'fuyugyo.shiftManage.departmentId';

type CandidateSortMode = 'kana' | 'workload';

type SelectedCell = {
  date: string;
  shiftTypeId: string;
};

/** シフト枠（日付 × 部門 × シフト種別）を月マトリクスで編集する管理コンポーネント。 */
export function ShiftManager() {
  const [month, setMonth] = useState(toMonth(todayString()));
  const [departmentId, setDepartmentId] = useState('');
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const formData = useShiftFormData();
  const monthly = useMonthlyView(month);
  const days = useMemo(() => monthDays(month), [month]);

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

  const goPrevMonth = () => setMonth((current) => addMonths(current, -1));
  const goNextMonth = () => setMonth((current) => addMonths(current, 1));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>シフト管理</Title>
        <Group gap="xs" align="flex-end">
          <Button type="button" variant="outline" size="sm" onClick={goPrevMonth}>
            前月
          </Button>
          <TextInput
            type="month"
            label="対象月"
            value={month}
            onChange={(e) => setMonth(e.currentTarget.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={goNextMonth}>
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
          <Select
            label="部門"
            data={formData.data.departments.map((dept) => ({ value: dept.id, label: dept.name }))}
            value={departmentId || null}
            onChange={(value) => setDepartmentId(value ?? '')}
            allowDeselect={false}
            w={{ base: '100%', sm: 280 }}
          />

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" style={{ alignItems: 'start' }}>
            <ShiftMatrix
              days={days}
              departmentId={departmentId}
              shiftTypes={formData.data.shiftTypes}
              shifts={monthly.data?.shifts ?? []}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
            />
            {selectedCell && departmentId ? (
              <AssignmentPanel
                key={`${selectedCell.date}-${departmentId}-${selectedCell.shiftTypeId}`}
                date={selectedCell.date}
                departmentId={departmentId}
                shiftTypeId={selectedCell.shiftTypeId}
                shiftTypeName={
                  formData.data.shiftTypes.find((st) => st.id === selectedCell.shiftTypeId)?.name ??
                  ''
                }
              />
            ) : (
              <Card withBorder padding="md" radius="md">
                <Text c="dimmed" size="sm">
                  セルを選択してください
                </Text>
              </Card>
            )}
          </SimpleGrid>
        </>
      )}
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
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
};

/** シフト種別 × 当月全日の割り当てマトリクス。 */
function ShiftMatrix({
  days,
  departmentId,
  shiftTypes,
  shifts,
  selectedCell,
  onSelectCell,
}: ShiftMatrixProps) {
  const allOpenDates = useMemo(() => new Set(shifts.map((shift) => shift.date)), [shifts]);
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
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={500}>月マトリクス</Text>
          <Group gap={6}>
            <Badge color="gray" variant="light">
              休校日
            </Badge>
            <Badge color="blue" variant="light">
              稼働日
            </Badge>
          </Group>
        </Group>
        <ScrollArea type="auto" offsetScrollbars>
          <Table
            withColumnBorders
            withTableBorder
            verticalSpacing={4}
            horizontalSpacing={4}
            miw={Math.max(760, days.length * 42)}
            style={{ tableLayout: 'fixed' }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={120}>種別</Table.Th>
                {days.map((day) => {
                  const isClosed = !allOpenDates.has(day);
                  return (
                    <Table.Th key={day} w={isClosed ? 38 : 68} bg={isClosed ? 'gray.0' : 'blue.0'}>
                      <Stack gap={0} align="center">
                        <Text size="xs" fw={weekdayIndex(day) === 0 ? 700 : 500}>
                          {day.slice(8)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {weekdayLabel(day)}
                        </Text>
                      </Stack>
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shiftTypes.map((shiftType) => (
                <Table.Tr key={shiftType.id}>
                  <Table.Th>{shiftType.name}</Table.Th>
                  {days.map((day) => {
                    const shift = shiftByCell.get(cellKey(day, shiftType.id));
                    const isClosed = !allOpenDates.has(day);
                    const selected =
                      selectedCell?.date === day && selectedCell.shiftTypeId === shiftType.id;
                    const cellBg = selected ? 'blue.1' : isClosed ? 'gray.0' : null;
                    return (
                      <Table.Td key={day} {...(cellBg ? { bg: cellBg } : {})}>
                        <Button
                          type="button"
                          variant={selected ? 'filled' : shift ? 'light' : 'subtle'}
                          color={selected ? 'blue' : isClosed ? 'gray' : 'blue'}
                          size="compact-xs"
                          fullWidth
                          onClick={() => onSelectCell({ date: day, shiftTypeId: shiftType.id })}
                          styles={{ label: { whiteSpace: 'normal', lineHeight: 1.2 } }}
                        >
                          {assignmentSummary(shift)}
                        </Button>
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Card>
  );
}

type AssignmentPanelProps = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
  shiftTypeName: string;
};

/** 選択セルに連動する割り当て編集パネル。 */
function AssignmentPanel({ date, departmentId, shiftTypeId, shiftTypeName }: AssignmentPanelProps) {
  const editData = useShiftEditData({ date, departmentId, shiftTypeId });
  const upsert = useUpsertAssignmentSet();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<CandidateSortMode>('kana');
  const initialized = useRef(false);

  useEffect(() => {
    if (!editData.data || initialized.current) {
      return;
    }
    initialized.current = true;
    setSelectedIds(new Set(editData.data.shift?.assignedInstructorIds ?? []));
    setDescription(editData.data.shift?.description ?? '');
  }, [editData.data]);

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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const save = () => {
    upsert.mutate({
      date,
      departmentId,
      shiftTypeId,
      description: description.trim() || null,
      instructorIds: [...selectedIds],
    });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <div>
          <Text fw={500}>{shortDateLabel(date)}</Text>
          <Text size="sm" c="dimmed">
            {shiftTypeName}
          </Text>
        </div>

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
            {editData.data.conflicts.length > 0 && (
              <Alert color="yellow">
                {editData.data.conflicts.map((conflict) => (
                  <Text key={`${conflict.instructorId}-${conflict.conflictingShift.id}`} size="sm">
                    {conflict.instructorName}: {conflict.conflictingShift.departmentName} /{' '}
                    {conflict.conflictingShift.shiftTypeName}
                  </Text>
                ))}
              </Alert>
            )}

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

            <Stack gap="xs" mah={420} style={{ overflow: 'auto' }}>
              {candidates.length === 0 ? (
                <Text c="dimmed" size="sm">
                  候補がありません
                </Text>
              ) : (
                candidates.map((instructor) => (
                  <InstructorCheckbox
                    key={instructor.id}
                    instructor={instructor}
                    checked={selectedIds.has(instructor.id)}
                    onToggle={() => toggle(instructor.id)}
                  />
                ))
              )}
            </Stack>

            <Textarea
              label="備考"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              maxLength={500}
              rows={3}
            />

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {selectedIds.size}名を割り当て
              </Text>
              <Button type="button" size="sm" loading={upsert.isPending} onClick={save}>
                保存
              </Button>
            </Group>

            {upsert.isError && <Alert color="red">{upsert.error.message}</Alert>}
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
};

/** 割り当て候補インストラクターの1行。 */
function InstructorCheckbox({ instructor, checked, onToggle }: InstructorCheckboxProps) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Checkbox
        checked={checked}
        onChange={onToggle}
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
            今月 {instructor.workload.monthlyWorkDays}日{instructor.workload.hasWarning ? ' ⚠' : ''}
          </Badge>
        </Tooltip>
        {instructor.hasConflict && (
          <Badge color="yellow" variant="light" size="sm">
            競合
          </Badge>
        )}
      </Group>
    </Group>
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

function weekdayLabel(date: string): string {
  return ['日', '月', '火', '水', '木', '金', '土'][weekdayIndex(date)] ?? '';
}

function assignmentSummary(shift: ShiftViewItem | undefined): string {
  if (!shift || shift.assignedInstructors.length === 0) {
    return '-';
  }
  const first = shift.assignedInstructors[0];
  if (!first) {
    return '-';
  }
  const rest = shift.assignedInstructors.length - 1;
  return rest > 0 ? `${compactName(first.displayName)}+${rest}` : compactName(first.displayName);
}

function compactName(name: string): string {
  return name.split(' ')[0] ?? name;
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
