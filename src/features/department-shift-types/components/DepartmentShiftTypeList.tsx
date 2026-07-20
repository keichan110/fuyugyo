import { useMemo, useState } from 'react';

import { ActionIcon, Divider, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowDown, IconArrowUp, IconListDetails, IconTrash } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { ListEmptyState } from '@/components/ListEmptyState';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import { useShiftTypes } from '@/features/shift-types/queries';

import { useDepartmentShiftTypes, useUpdateDepartmentShiftTypes } from '../queries';
import type { DepartmentShiftType } from '../schema';

/** 部門ごとの利用可能なシフト種別を追加・除外・並べ替えする一覧。 */
export function DepartmentShiftTypeList({
  departmentCode,
  selectedShiftTypeId,
  onSelect,
  canAssign,
  canRemove,
  onRemoved,
  onDirtyChange,
}: {
  departmentCode: DepartmentCode;
  selectedShiftTypeId?: string | null;
  onSelect?: (shiftTypeId: string) => void;
  canAssign?: () => boolean;
  canRemove?: (shiftTypeId: string) => boolean;
  onRemoved?: (nextSelectedShiftTypeId: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const {
    data: departmentShiftTypes,
    isLoading,
    isError,
  } = useDepartmentShiftTypes(departmentCode);
  const {
    data: shiftTypes,
    isLoading: isShiftTypesLoading,
    isError: isShiftTypesError,
  } = useShiftTypes();
  const update = useUpdateDepartmentShiftTypes(departmentCode);
  const [stagedItems, setStagedItems] = useState<DepartmentShiftType[] | null>(null);
  const items = stagedItems ?? departmentShiftTypes ?? [];
  const assignedShiftTypeIds = new Set(items.map((item) => item.shiftTypeId));
  const shiftTypesToAssign = (shiftTypes ?? []).filter(
    (shiftType) => !assignedShiftTypeIds.has(shiftType.id),
  );

  const isDirty = useMemo(() => {
    if (!stagedItems || !departmentShiftTypes) return false;
    return !hasSameShiftTypeOrder(stagedItems, departmentShiftTypes);
  }, [departmentShiftTypes, stagedItems]);

  const stage = (nextItems: DepartmentShiftType[]) => {
    if (departmentShiftTypes && hasSameShiftTypeOrder(nextItems, departmentShiftTypes)) {
      setStagedItems(null);
      onDirtyChange?.(false);
      return;
    }
    setStagedItems(nextItems);
    onDirtyChange?.(departmentShiftTypes !== undefined);
  };

  const save = () => {
    update.mutate(
      { shiftTypeIds: items.map((item) => item.shiftTypeId) },
      {
        onSuccess: () => {
          setStagedItems(null);
          onDirtyChange?.(false);
          notifications.show({ color: 'green', message: 'シフト種別の利用設定を保存しました' });
        },
      },
    );
  };

  const assign = (shiftTypeId: string | null) => {
    if (!shiftTypeId || canAssign?.() === false) return;

    const shiftType = shiftTypesToAssign.find((item) => item.id === shiftTypeId);
    if (!shiftType) return;

    stage([
      ...items,
      {
        shiftTypeId: shiftType.id,
        name: shiftType.name,
        isActive: shiftType.isActive,
        sortOrder: items.length + 1,
      },
    ]);
  };

  const move = (shiftTypeId: string, offset: -1 | 1) => {
    const sourceIndex = items.findIndex((item) => item.shiftTypeId === shiftTypeId);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    const [source] = reordered.splice(sourceIndex, 1);
    if (!source) return;
    reordered.splice(targetIndex, 0, source);
    stage(reordered);
  };

  const remove = (shiftTypeId: string) => {
    const nextItems = items.filter((item) => item.shiftTypeId !== shiftTypeId);
    stage(nextItems);
    if (selectedShiftTypeId === shiftTypeId) {
      onRemoved?.(nextItems[0]?.shiftTypeId ?? null);
    }
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text fw={600}>{DEPARTMENT_LABELS[departmentCode]}部門で利用するシフト種別</Text>
        <Text c="dimmed" size="sm">
          マスタから追加し、上下ボタンで表示順を変更できます。
        </Text>
      </Stack>

      <Select
        label="シフト種別を追加"
        placeholder="シフト種別を選択"
        searchable
        value={null}
        data={shiftTypesToAssign.map((shiftType) => ({
          value: shiftType.id,
          label: shiftType.name,
        }))}
        nothingFoundMessage="追加できるシフト種別がありません"
        disabled={isShiftTypesLoading || update.isPending || shiftTypesToAssign.length === 0}
        onChange={assign}
      />
      <Divider />

      {isError && <ErrorAlert>部門別シフト種別の取得に失敗しました</ErrorAlert>}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中...
        </Text>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <ListEmptyState
          icon={<IconListDetails size={32} stroke={1.5} />}
          title="シフト種別がありません"
          description="上のセレクトから、この部門で利用する種別を追加してください。"
        />
      )}

      {items.length > 0 && (
        <Stack gap="xs">
          {items.map((item, index) => (
            <ShiftTypeRow
              key={item.shiftTypeId}
              item={item}
              isUpdating={update.isPending}
              onRemove={() => {
                if (canRemove?.(item.shiftTypeId) === false) return;
                remove(item.shiftTypeId);
              }}
              selected={selectedShiftTypeId === item.shiftTypeId}
              onSelect={() => onSelect?.(item.shiftTypeId)}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMoveUp={() => move(item.shiftTypeId, -1)}
              onMoveDown={() => move(item.shiftTypeId, 1)}
            />
          ))}
        </Stack>
      )}

      {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
      {isShiftTypesError && <ErrorAlert>シフト種別マスタの取得に失敗しました</ErrorAlert>}
      {isDirty && (
        <UnsavedChangesBar
          description="この部門で利用するシフト種別と表示順をまとめて保存します"
          loading={update.isPending}
          onCancel={() => {
            setStagedItems(null);
            onDirtyChange?.(false);
          }}
          onSave={save}
        />
      )}
    </Stack>
  );
}

function hasSameShiftTypeOrder(
  first: DepartmentShiftType[],
  second: DepartmentShiftType[],
): boolean {
  return (
    first.length === second.length &&
    first.every((item, index) => item.shiftTypeId === second[index]?.shiftTypeId)
  );
}

type ShiftTypeRowProps = {
  item: DepartmentShiftType;
  isUpdating: boolean;
  onRemove: () => void;
  selected: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

/** 上下移動とステージへの除外を提供する部門別シフト種別の1行。 */
function ShiftTypeRow({
  item,
  isUpdating,
  onRemove,
  selected,
  onSelect,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: ShiftTypeRowProps) {
  return (
    <Paper
      withBorder
      p="sm"
      style={{
        cursor: isUpdating ? 'wait' : 'pointer',
        background: selected ? 'var(--mantine-color-blue-light)' : undefined,
      }}
      onClick={onSelect}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Text fw={500} size="sm">
            {item.name}
          </Text>
          {!item.isActive && <AppBadge kind="inactive">無効</AppBadge>}
        </Group>
        <Group gap={2} wrap="nowrap" onClick={(event) => event.stopPropagation()}>
          <ActionIcon
            aria-label={`${item.name}を上へ移動`}
            variant="subtle"
            disabled={isUpdating || !canMoveUp}
            onClick={onMoveUp}
          >
            <IconArrowUp size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label={`${item.name}を下へ移動`}
            variant="subtle"
            disabled={isUpdating || !canMoveDown}
            onClick={onMoveDown}
          >
            <IconArrowDown size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label={`${item.name}を除外`}
            color="red"
            variant="subtle"
            loading={isUpdating}
            onClick={onRemove}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}
