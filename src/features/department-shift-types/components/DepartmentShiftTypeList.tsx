import { useRef, useState } from 'react';

import { ActionIcon, Button, Group, Menu, Paper, Stack, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconGripVertical, IconListDetails, IconPlus, IconX } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { ListEmptyState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';
import { useShiftTypes } from '@/features/shift-types/queries';

import { useDepartmentShiftTypes, useUpdateDepartmentShiftTypes } from '../queries';
import type { DepartmentShiftType } from '../schema';

const DEPARTMENT_CODES = departmentCodeSchema.options;

/** 部門ごとの利用可能なシフト種別を追加・除外・並べ替えする管理画面。 */
export function DepartmentShiftTypeList() {
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('ski');
  const parsedDepartmentCode = departmentCodeSchema.safeParse(departmentCode);

  return (
    <Stack gap="md">
      <ListHeader title="部門別シフト種別" unit="件" />
      <Tabs
        value={departmentCode}
        onChange={(value) => {
          const parsed = departmentCodeSchema.safeParse(value);
          if (parsed.success) setDepartmentCode(parsed.data);
        }}
      >
        <Tabs.List>
          {DEPARTMENT_CODES.map((code) => (
            <Tabs.Tab key={code} value={code}>
              {DEPARTMENT_LABELS[code]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {parsedDepartmentCode.success && (
        <DepartmentShiftTypePanel departmentCode={parsedDepartmentCode.data} />
      )}
    </Stack>
  );
}

/** 選択中の部門について、種別リストとカタログからの追加メニューを表示する。 */
function DepartmentShiftTypePanel({ departmentCode }: { departmentCode: DepartmentCode }) {
  const dragSourceId = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const {
    data: departmentShiftTypes,
    isLoading,
    isError,
  } = useDepartmentShiftTypes(departmentCode);
  const { data: shiftTypes } = useShiftTypes(false);
  const update = useUpdateDepartmentShiftTypes(departmentCode);
  const items = departmentShiftTypes ?? [];
  const assignedIds = new Set(items.map((item) => item.shiftTypeId));
  const candidates = (shiftTypes ?? []).filter(
    (shiftType) => shiftType.isActive && !assignedIds.has(shiftType.id),
  );

  const save = (shiftTypeIds: string[], message: string) => {
    update.mutate(
      { shiftTypeIds },
      {
        onSuccess: () => notifications.show({ color: 'green', message }),
      },
    );
  };

  const add = (shiftTypeId: string, name: string) => {
    save([...items.map((item) => item.shiftTypeId), shiftTypeId], `${name}を追加しました`);
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
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          ドラッグして表示順を変更できます。
        </Text>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button leftSection={<IconPlus size={16} />} loading={update.isPending}>
              追加
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {candidates.length === 0 ? (
              <Menu.Item disabled>追加できるシフト種別はありません</Menu.Item>
            ) : (
              candidates.map((shiftType) => (
                <Menu.Item key={shiftType.id} onClick={() => add(shiftType.id, shiftType.name)}>
                  {shiftType.name}
                </Menu.Item>
              ))
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>

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
          description="追加から、この部門で使うシフト種別を登録してください。"
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
