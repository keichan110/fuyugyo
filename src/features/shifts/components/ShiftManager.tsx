import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';

import {
  useCreateShift,
  useDeleteShift,
  useShiftEditData,
  useShiftFormData,
  useUpdateShift,
} from '../queries';
import type { AvailableInstructor } from '../schema';
import { todayString } from '../view-utils';

/**
 * シフト枠（日付 × 部門 × シフト種別）の作成・編集・割り当て変更を行う管理コンポーネント。
 * 集約エンドポイント（form-data / edit-data）から選択肢と割り当て候補を取得し、
 * 作成（POST）・更新（PATCH）・削除（DELETE）を1画面で完結させる。
 */
export function ShiftManager() {
  const [date, setDate] = useState(todayString());
  const [departmentId, setDepartmentId] = useState('');
  const [shiftTypeId, setShiftTypeId] = useState('');

  const formData = useShiftFormData();

  // 部門・シフト種別が未選択なら先頭を初期選択する
  useEffect(() => {
    if (!departmentId && formData.data?.departments[0]) {
      setDepartmentId(formData.data.departments[0].id);
    }
  }, [departmentId, formData.data]);
  useEffect(() => {
    if (!shiftTypeId && formData.data?.shiftTypes[0]) {
      setShiftTypeId(formData.data.shiftTypes[0].id);
    }
  }, [shiftTypeId, formData.data]);

  const canEdit = !!(date && departmentId && shiftTypeId);

  return (
    <Stack gap="md">
      <Title order={2}>シフト管理</Title>

      {formData.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {formData.isError && <Alert color="red">フォームデータの取得に失敗しました</Alert>}

      {formData.data && (
        <Card withBorder padding="md" radius="md">
          <Group gap="md" wrap="wrap">
            <TextInput
              type="date"
              label="日付"
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
            <Select
              label="部門"
              data={formData.data.departments.map((dept) => ({
                value: dept.id,
                label: dept.name,
              }))}
              value={departmentId || null}
              onChange={(value) => setDepartmentId(value ?? '')}
              allowDeselect={false}
            />
            <Select
              label="シフト種別"
              data={formData.data.shiftTypes.map((st) => ({ value: st.id, label: st.name }))}
              value={shiftTypeId || null}
              onChange={(value) => setShiftTypeId(value ?? '')}
              allowDeselect={false}
            />
          </Group>
        </Card>
      )}

      {canEdit && (
        <ShiftEditor
          key={`${date}-${departmentId}-${shiftTypeId}`}
          date={date}
          departmentId={departmentId}
          shiftTypeId={shiftTypeId}
        />
      )}
    </Stack>
  );
}

type ShiftEditorProps = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
};

/**
 * 選択中の (date × 部門 × 種別) に対する編集パネル。
 * edit-data から既存シフト・割り当て候補を読み込み、割り当て・備考を編集して保存する。
 */
function ShiftEditor({ date, departmentId, shiftTypeId }: ShiftEditorProps) {
  const editData = useShiftEditData({ date, departmentId, shiftTypeId });
  const createShift = useCreateShift();
  const updateShift = useUpdateShift(editData.data?.shift?.id ?? '');
  const deleteShift = useDeleteShift();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');

  // 初回ロード時のみ初期値を反映する。background refetch（フォーカス時など）で
  // 編集中の入力を上書きしないようフラグでガードする。
  // （日付・部門・種別の切り替え時は親が key で remount するためフラグもリセットされる）
  const initialized = useRef(false);
  useEffect(() => {
    if (!editData.data || initialized.current) {
      return;
    }
    initialized.current = true;
    setSelectedIds(new Set(editData.data.shift?.assignedInstructorIds ?? []));
    setDescription(editData.data.shift?.description ?? '');
  }, [editData.data]);

  if (editData.isLoading) {
    return (
      <Text c="dimmed" size="sm">
        読み込み中…
      </Text>
    );
  }
  if (editData.isError || !editData.data) {
    return <Alert color="red">{editData.error?.message ?? '編集データの取得に失敗しました'}</Alert>;
  }

  const { mode, shift, availableInstructors } = editData.data;
  const isEdit = mode === 'edit';

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

  const handleSave = () => {
    const instructorIds = [...selectedIds];
    const trimmedDescription = description.trim();
    if (isEdit && shift) {
      updateShift.mutate({
        description: trimmedDescription || null,
        instructorIds,
      });
    } else {
      createShift.mutate({
        date,
        departmentId,
        shiftTypeId,
        description: trimmedDescription || undefined,
        instructorIds,
      });
    }
  };

  const handleDelete = () => {
    if (shift) {
      deleteShift.mutate(shift.id);
    }
  };

  const saving = createShift.isPending || updateShift.isPending;
  const saveError = createShift.error ?? updateShift.error;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={500}>{isEdit ? 'シフトを編集' : '新規シフトを作成'}</Text>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={deleteShift.isPending}
              onClick={handleDelete}
            >
              シフトを削除
            </Button>
          )}
        </Group>

        {availableInstructors.length === 0 ? (
          <Text c="dimmed" size="sm">
            この部門に割り当て可能なインストラクターがいません
          </Text>
        ) : (
          <Stack gap="xs">
            {availableInstructors.map((inst) => (
              <InstructorCheckbox
                key={inst.id}
                instructor={inst}
                checked={selectedIds.has(inst.id)}
                onToggle={() => toggle(inst.id)}
              />
            ))}
          </Stack>
        )}

        <Textarea
          label="備考（任意）"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          maxLength={500}
          rows={2}
        />

        <Button type="button" size="sm" loading={saving} onClick={handleSave}>
          {isEdit ? '更新' : '作成'}
        </Button>

        {saveError && <Alert color="red">{saveError.message}</Alert>}
        {deleteShift.isError && <Alert color="red">{deleteShift.error.message}</Alert>}
      </Stack>
    </Card>
  );
}

type InstructorCheckboxProps = {
  instructor: AvailableInstructor;
  checked: boolean;
  onToggle: () => void;
};

/** 割り当て候補インストラクターの1行（チェックボックス + 競合警告）。 */
function InstructorCheckbox({ instructor, checked, onToggle }: InstructorCheckboxProps) {
  return (
    <Group justify="space-between" gap="xs">
      <Checkbox
        checked={checked}
        onChange={onToggle}
        label={
          <Group gap={4} component="span">
            <Text component="span" size="sm">
              {instructor.displayName}
            </Text>
            {instructor.certificationSummary && (
              <Text component="span" c="dimmed" size="xs">
                （{instructor.certificationSummary}）
              </Text>
            )}
          </Group>
        }
      />
      {instructor.hasConflict && (
        <Badge color="yellow" variant="light" size="sm">
          同日に別シフトあり
        </Badge>
      )}
    </Group>
  );
}
