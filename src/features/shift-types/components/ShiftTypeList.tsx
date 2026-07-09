import { useState } from 'react';

import { Alert, Badge, Button, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';

import { useDeactivateShiftType, useShiftTypes, useUpdateShiftType } from '../queries';
import { ShiftTypeForm } from './ShiftTypeForm';

/**
 * シフト種別一覧と作成・編集・無効化操作を提供するコンポーネント。
 */
export function ShiftTypeList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効種別も表示するため全件取得する
  const { data, isLoading, isError } = useShiftTypes(false);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>シフト種別管理</Title>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : 'シフト種別を追加'}
        </Button>
      </Group>

      {showForm && <ShiftTypeForm onSuccess={() => setShowForm(false)} />}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">シフト種別一覧の取得に失敗しました</Alert>}

      {data && data.length === 0 && (
        <Text c="dimmed" size="sm">
          シフト種別がありません
        </Text>
      )}

      {data && data.length > 0 && (
        <Table highlightOnHover withTableBorder withRowBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>種別名</Table.Th>
              <Table.Th w={160}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((shiftType) => (
              <ShiftTypeRow
                key={shiftType.id}
                id={shiftType.id}
                name={shiftType.name}
                isActive={shiftType.isActive}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

type ShiftTypeRowProps = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * シフト種別の1行表示。編集・無効化ボタンを持つ。
 * deactivate フックをアイテム内に持つことで、各行が独立した操作状態を管理する。
 */
function ShiftTypeRow({ id, name, isActive }: ShiftTypeRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const update = useUpdateShiftType(id);
  const deactivate = useDeactivateShiftType();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ name: editName }, { onSuccess: () => setEditing(false) });
  };

  if (editing) {
    return (
      <Table.Tr>
        <Table.Td colSpan={2}>
          <Stack gap="xs">
            <Group component="form" onSubmit={handleUpdate} wrap="nowrap">
              <TextInput
                value={editName}
                onChange={(e) => setEditName(e.currentTarget.value)}
                required
                maxLength={100}
                autoFocus
                style={{ flex: 1 }}
              />
              <Button type="submit" size="xs" loading={update.isPending}>
                保存
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setEditName(name);
                  setEditing(false);
                }}
              >
                キャンセル
              </Button>
            </Group>
            {update.isError && <Alert color="red">{update.error.message}</Alert>}
          </Stack>
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{name}</Text>
          {!isActive && (
            <Badge color="gray" variant="light" size="sm">
              無効
            </Badge>
          )}
        </Group>
        {deactivate.isError && (
          <Alert color="red" mt="xs">
            {deactivate.error.message}
          </Alert>
        )}
      </Table.Td>
      <Table.Td>
        {isActive && (
          <Group gap="xs">
            <Button variant="outline" size="xs" onClick={() => setEditing(true)}>
              編集
            </Button>
            <Button
              variant="outline"
              size="xs"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate(id)}
            >
              無効化
            </Button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
