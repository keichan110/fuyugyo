import { useRef, useState } from 'react';

import { ActionIcon, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconGripVertical, IconListDetails, IconX } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { ListEmptyState } from '@/components/ListEmptyState';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';

import { useDepartmentShiftTypes, useUpdateDepartmentShiftTypes } from '../queries';
import type { DepartmentShiftType } from '../schema';

/** 部門ごとの利用可能なシフト種別を追加・除外・並べ替えする一覧。 */
export function DepartmentShiftTypeList({ departmentCode }: { departmentCode: DepartmentCode }) {
  const dragSourceId = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const {
    data: departmentShiftTypes,
    isLoading,
    isError,
  } = useDepartmentShiftTypes(departmentCode);
  const update = useUpdateDepartmentShiftTypes(departmentCode);
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
    save(
      items.filter((item) => item.shiftTypeId !== shiftTypeId).map((item) => item.shiftTypeId),
      `${name}を除外しました`,
    );
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

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text fw={600}>{DEPARTMENT_LABELS[departmentCode]}部門で利用するシフト種別</Text>
        <Text c="dimmed" size="sm">
          マスタ一覧の ← で追加し、ドラッグして表示順を変更できます。
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
          {items.map((item) => (
            <ShiftTypeRow
              key={item.shiftTypeId}
              item={item}
              isDragged={draggedId === item.shiftTypeId}
              isUpdating={update.isPending}
              onDragStart={() => {
                dragSourceId.current = item.shiftTypeId;
                setDraggedId(item.shiftTypeId);
              }}
              onDragEnd={() => {
                dragSourceId.current = null;
                setDraggedId(null);
              }}
              onDrop={() => reorder(item.shiftTypeId)}
              onRemove={() => remove(item.shiftTypeId, item.name)}
            />
          ))}
        </Stack>
      )}

      {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
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
}: ShiftTypeRowProps) {
  return (
    <Paper
      withBorder
      p="sm"
      draggable={!isUpdating}
      opacity={isDragged ? 0.5 : 1}
      style={{ cursor: isUpdating ? 'wait' : 'grab' }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconGripVertical aria-hidden size={18} color="var(--mantine-color-dimmed)" />
          <Text fw={500} size="sm">
            {item.name}
          </Text>
          {!item.isActive && <AppBadge kind="inactive">無効</AppBadge>}
        </Group>
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
    </Paper>
  );
}
