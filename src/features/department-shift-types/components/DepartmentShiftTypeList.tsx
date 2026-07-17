import { useRef, useState } from 'react';

import { ActionIcon, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconGripVertical,
  IconListDetails,
  IconPlus,
  IconX,
} from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { ListEmptyState } from '@/components/ListEmptyState';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';

import {
  useDepartmentShiftTypes,
  useRemoveDepartmentShiftType,
  useUpdateDepartmentShiftTypes,
} from '../queries';
import type { DepartmentShiftType } from '../schema';

/** 部門ごとの利用可能なシフト種別を追加・除外・並べ替えする一覧。 */
export function DepartmentShiftTypeList({
  departmentCode,
  selectedShiftTypeId,
  onSelect,
  onAdd,
  canRemove,
}: {
  departmentCode: DepartmentCode;
  selectedShiftTypeId?: string | null;
  onSelect?: (shiftTypeId: string) => void;
  onAdd?: () => void;
  canRemove?: (shiftTypeId: string) => boolean;
}) {
  const dragSourceId = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const {
    data: departmentShiftTypes,
    isLoading,
    isError,
  } = useDepartmentShiftTypes(departmentCode);
  const update = useUpdateDepartmentShiftTypes(departmentCode);
  const removeMutation = useRemoveDepartmentShiftType(departmentCode);
  const items = departmentShiftTypes ?? [];

  const save = (shiftTypeIds: string[], message: string) => {
    update.mutate(
      { shiftTypeIds },
      {
        onSuccess: () => notifications.show({ color: 'green', message }),
      },
    );
  };

  const remove = (shiftTypeId: string, name: string) => {
    removeMutation.mutate(shiftTypeId, {
      onSuccess: () => notifications.show({ color: 'green', message: `${name}を除外しました` }),
    });
  };

  const reorder = (targetId: string) => {
    const sourceId = dragSourceId.current;
    dragSourceId.current = null;
    setDraggedId(null);
    if (!sourceId || sourceId === targetId) return;

    // ドロップ先の位置へ挿入した順序付き ID 配列を API に渡し、部門内の sort_order を一括更新する
    const sourceIndex = items.findIndex((item) => item.shiftTypeId === sourceId);
    const targetIndex = items.findIndex((item) => item.shiftTypeId === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reordered = [...items];
    const [source] = reordered.splice(sourceIndex, 1);
    if (!source) return;
    reordered.splice(targetIndex, 0, source);
    save(
      reordered.map((item) => item.shiftTypeId),
      '並び順を更新しました',
    );
  };

  const move = (shiftTypeId: string, offset: -1 | 1) => {
    const sourceIndex = items.findIndex((item) => item.shiftTypeId === shiftTypeId);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    const [source] = reordered.splice(sourceIndex, 1);
    if (!source) return;
    reordered.splice(targetIndex, 0, source);
    save(
      reordered.map((item) => item.shiftTypeId),
      '並び順を更新しました',
    );
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text fw={600}>{DEPARTMENT_LABELS[departmentCode]}部門で利用するシフト種別</Text>
        <Text c="dimmed" size="sm">
          マスタから追加し、ドラッグまたは上下ボタンで表示順を変更できます。
        </Text>
      </Stack>

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
          description="マスタ一覧の ← から、この部門で利用する種別を追加してください。"
        />
      )}

      {items.length > 0 && (
        <Stack gap="xs">
          {items.map((item, index) => (
            <ShiftTypeRow
              key={item.shiftTypeId}
              item={item}
              isDragged={draggedId === item.shiftTypeId}
              isUpdating={update.isPending || removeMutation.isPending}
              onDragStart={() => {
                dragSourceId.current = item.shiftTypeId;
                setDraggedId(item.shiftTypeId);
              }}
              onDragEnd={() => {
                dragSourceId.current = null;
                setDraggedId(null);
              }}
              onDrop={() => reorder(item.shiftTypeId)}
              onRemove={() => {
                if (canRemove?.(item.shiftTypeId) === false) return;
                remove(item.shiftTypeId, item.name);
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

      {onAdd && (
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onAdd}>
          シフト種別を追加
        </Button>
      )}

      {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
      {removeMutation.isError && <ErrorAlert>{removeMutation.error.message}</ErrorAlert>}
    </Stack>
  );
}

type ShiftTypeRowProps = {
  item: DepartmentShiftType;
  isDragged: boolean;
  isUpdating: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onRemove: () => void;
  selected: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

/** ドラッグ操作と即時除外を提供する部門別シフト種別の1行。 */
function ShiftTypeRow({
  item,
  isDragged,
  isUpdating,
  onDragStart,
  onDragEnd,
  onDrop,
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
      opacity={isDragged ? 0.5 : 1}
      style={{
        cursor: isUpdating ? 'wait' : 'pointer',
        background: selected ? 'var(--mantine-color-blue-light)' : undefined,
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <span
            draggable={!isUpdating}
            style={{ display: 'flex', cursor: 'grab' }}
            onDragStart={(event) => {
              event.stopPropagation();
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            onClick={(event) => event.stopPropagation()}
          >
            <IconGripVertical
              aria-label={`${item.name}を並び替え`}
              size={18}
              color="var(--mantine-color-dimmed)"
            />
          </span>
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
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}
