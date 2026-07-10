import { useMemo, useState } from 'react';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  EmptyState,
  Group,
  Menu,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBuilding, IconDotsVertical, IconPlus, IconSearch } from '@tabler/icons-react';

import { useDeactivateDepartment, useDepartments } from '../queries';
import type { Department } from '../schema';
import { DepartmentDrawer, type DepartmentDrawerState } from './DepartmentDrawer';

/** ステータス絞り込みの選択肢 */
const STATUS_FILTERS = [
  { label: 'すべて', value: 'ALL' },
  { label: 'アクティブ', value: 'ACTIVE' },
  { label: '無効', value: 'INACTIVE' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

/**
 * 部門一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・無効化は DepartmentDrawer に集約する。
 */
export function DepartmentList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [drawerState, setDrawerState] = useState<DepartmentDrawerState | null>(null);

  // 管理画面では無効部門も表示するため全件取得する
  const { data, isLoading, isError } = useDepartments(false);
  const allDepartments = useMemo(() => data ?? [], [data]);
  const activeCount = allDepartments.filter((d) => d.isActive).length;

  const visibleDepartments = useMemo(() => {
    const query = search.trim();
    return allDepartments.filter((department) => {
      if (statusFilter === 'ACTIVE' && !department.isActive) return false;
      if (statusFilter === 'INACTIVE' && department.isActive) return false;
      if (query.length === 0) return true;
      const haystack = `${department.code}${department.name}`;
      return haystack.includes(query);
    });
  }, [allDepartments, statusFilter, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>部門管理</Title>
          {!isLoading && (
            <Text c="dimmed" size="sm">
              全{allDepartments.length}件（アクティブ{activeCount}件）
            </Text>
          )}
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDrawerState({ mode: 'create' })}
        >
          部門を追加
        </Button>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="コード・部門名で検索"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <SegmentedControl
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          data={STATUS_FILTERS.map((f) => ({ label: f.label, value: f.value }))}
        />
      </Group>

      {isError && <Alert color="red">部門一覧の取得に失敗しました</Alert>}

      {isLoading && (
        <Stack gap="xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={52} radius="sm" />
          ))}
        </Stack>
      )}

      {!isLoading && allDepartments.length === 0 && (
        <EmptyState
          icon={<IconBuilding size={32} stroke={1.5} />}
          title="部門がありません"
          description="最初の部門を追加しましょう。"
        >
          <EmptyState.Actions>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              部門を追加
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      )}

      {!isLoading && allDepartments.length > 0 && visibleDepartments.length === 0 && (
        <EmptyState
          icon={<IconSearch size={32} stroke={1.5} />}
          title="条件に一致する部門がありません"
          description="検索キーワードや絞り込み条件を変更してみてください。"
        />
      )}

      {visibleDepartments.length > 0 && (
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover withTableBorder withRowBorders verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>コード</Table.Th>
                <Table.Th>部門名</Table.Th>
                <Table.Th>説明</Table.Th>
                <Table.Th w={120}>状態</Table.Th>
                <Table.Th w={56} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleDepartments.map((department) => (
                <DepartmentRow
                  key={department.id}
                  department={department}
                  onEdit={() => setDrawerState({ mode: 'edit', departmentId: department.id })}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <DepartmentDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type DepartmentRowProps = {
  department: Department;
  onEdit: () => void;
};

/** 部門一覧の1行。クリックで編集 Drawer を開く。 */
function DepartmentRow({ department, onEdit }: DepartmentRowProps) {
  const deactivate = useDeactivateDepartment();

  const handleDeactivate = () => {
    deactivate.mutate(department.id, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: `${department.name}を無効化しました`,
        });
      },
    });
  };

  return (
    <Table.Tr onClick={onEdit} style={{ cursor: 'pointer' }}>
      <Table.Td>
        <Text c="dimmed" size="sm" ff="monospace">
          {department.code}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fw={500} size="sm">
          {department.name}
        </Text>
      </Table.Td>
      <Table.Td>
        {department.description && (
          <Text c="dimmed" size="sm" lineClamp={1}>
            {department.description}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Badge color={department.isActive ? 'green' : 'gray'} variant="light">
          {department.isActive ? 'アクティブ' : '無効'}
        </Badge>
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray">
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onEdit}>編集</Menu.Item>
            {department.isActive && (
              <Menu.Item onClick={handleDeactivate} disabled={deactivate.isPending}>
                無効化
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}
