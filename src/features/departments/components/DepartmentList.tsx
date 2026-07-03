import { useState } from 'react';

import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';

import { useDeactivateDepartment, useDepartments } from '../queries';
import { DepartmentForm } from './DepartmentForm';

/**
 * 部門一覧と作成・無効化操作を提供するコンポーネント。
 */
export function DepartmentList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効部門も表示するため全件取得する
  const { data, isLoading, isError } = useDepartments(false);
  const deactivate = useDeactivateDepartment();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>部門管理</Title>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '部門を追加'}
        </Button>
      </Group>

      {showForm && <DepartmentForm onSuccess={() => setShowForm(false)} />}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">部門一覧の取得に失敗しました</Alert>}

      {data && data.length === 0 && (
        <Text c="dimmed" size="sm">
          部門がありません
        </Text>
      )}

      {data && data.length > 0 && (
        <Stack gap="sm">
          {data.map((dept) => (
            <Card key={dept.id} withBorder padding="md" radius="md">
              <Group justify="space-between">
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text c="dimmed" size="sm" ff="monospace">
                      {dept.code}
                    </Text>
                    <Text fw={500}>{dept.name}</Text>
                    {!dept.isActive && (
                      <Badge color="gray" variant="light" size="sm">
                        無効
                      </Badge>
                    )}
                  </Group>
                  {dept.description && (
                    <Text c="dimmed" size="sm">
                      {dept.description}
                    </Text>
                  )}
                </Stack>
                {dept.isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={deactivate.isPending}
                    onClick={() => deactivate.mutate(dept.id)}
                  >
                    無効化
                  </Button>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
