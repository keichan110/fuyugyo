import { useState } from 'react';

import { Alert, Badge, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core';

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
        <Stack gap="sm">
          {data.map((shiftType) => (
            <ShiftTypeItem
              key={shiftType.id}
              id={shiftType.id}
              name={shiftType.name}
              isActive={shiftType.isActive}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type ShiftTypeItemProps = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * シフト種別の1行表示。編集・無効化ボタンを持つ。
 * deactivate フックをアイテム内に持つことで、各行が独立した操作状態を管理する。
 */
function ShiftTypeItem({ id, name, isActive }: ShiftTypeItemProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const update = useUpdateShiftType(id);
  const deactivate = useDeactivateShiftType();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ name: editName }, { onSuccess: () => setEditing(false) });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        {editing ? (
          <Group component="form" onSubmit={handleUpdate} wrap="nowrap">
            <TextInput
              value={editName}
              onChange={(e) => setEditName(e.currentTarget.value)}
              required
              maxLength={100}
              autoFocus
              style={{ flex: 1 }}
            />
            <Button type="submit" size="sm" loading={update.isPending}>
              保存
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditName(name);
                setEditing(false);
              }}
            >
              キャンセル
            </Button>
          </Group>
        ) : (
          <Group justify="space-between">
            <Group gap="xs">
              <Text fw={500}>{name}</Text>
              {!isActive && (
                <Badge color="gray" variant="light" size="sm">
                  無効
                </Badge>
              )}
            </Group>
            {isActive && (
              <Group gap="xs">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  編集
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={deactivate.isPending}
                  onClick={() => deactivate.mutate(id)}
                >
                  無効化
                </Button>
              </Group>
            )}
          </Group>
        )}

        {update.isError && <Alert color="red">{update.error.message}</Alert>}
        {deactivate.isError && <Alert color="red">{deactivate.error.message}</Alert>}
      </Stack>
    </Card>
  );
}
