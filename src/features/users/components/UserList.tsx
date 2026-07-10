import { useMemo, useState } from 'react';

import {
  ActionIcon,
  Alert,
  Avatar,
  EmptyState,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDotsVertical, IconSearch, IconUsers } from '@tabler/icons-react';

import { AppBadge, type AppBadgeKind } from '@/components/AppBadge';
import { AppTable } from '@/components/AppTable';
import { ClickableTr } from '@/components/ClickableTr';
import { SearchInput } from '@/components/SearchInput';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useActivateUser, useDeactivateUser, useUsers } from '../queries';
import type { User, UserRole } from '../schema';
import { UserDrawer, type UserDrawerState } from './UserDrawer';

/** ロールごとの表示ラベルとバッジ種別 */
const ROLE_META: Record<UserRole, { label: string; badgeKind: AppBadgeKind }> = {
  ADMIN: { label: '管理者', badgeKind: 'roleAdmin' },
  MANAGER: { label: 'マネージャー', badgeKind: 'roleManager' },
  MEMBER: { label: 'メンバー', badgeKind: 'roleMember' },
};

/** ステータス絞り込みの選択肢 */
const STATUS_FILTERS = [
  { label: 'すべて', value: 'ALL' },
  { label: 'アクティブ', value: 'ACTIVE' },
  { label: '無効', value: 'INACTIVE' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

/**
 * ユーザー一覧と検索・絞り込み、編集への導線を提供するコンポーネント（ADMIN 専用）。
 * ユーザーは LINE 招待経由で登録されるため作成導線は持たず、ロール変更・
 * Instructor リンク・ステータス変更は UserDrawer に集約する。
 */
export function UserList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [drawerState, setDrawerState] = useState<UserDrawerState | null>(null);

  const { data, isLoading, isError } = useUsers();
  const allUsers = useMemo(() => data ?? [], [data]);
  const activeCount = allUsers.filter((u) => u.isActive).length;

  const visibleUsers = useMemo(() => {
    const query = search.trim();
    return allUsers.filter((user) => {
      if (statusFilter !== 'ALL' && user.isActive !== (statusFilter === 'ACTIVE')) return false;
      if (query.length === 0) return true;
      return user.displayName.includes(query);
    });
  }, [allUsers, statusFilter, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>ユーザー管理</Title>
          {!isLoading && (
            <Text c="dimmed" size="sm">
              全{allUsers.length}名（アクティブ{activeCount}名）
            </Text>
          )}
        </div>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <SearchInput
          placeholder="ユーザー名で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <SegmentedControl
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          data={STATUS_FILTERS.map((f) => ({ label: f.label, value: f.value }))}
        />
      </Group>

      {isError && <Alert color="red">ユーザー一覧の取得に失敗しました</Alert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allUsers.length === 0 && (
        <EmptyState icon={<IconUsers size={32} stroke={1.5} />} title="ユーザーがいません" />
      )}

      {!isLoading && allUsers.length > 0 && visibleUsers.length === 0 && (
        <EmptyState
          icon={<IconSearch size={32} stroke={1.5} />}
          title="条件に一致するユーザーがいません"
          description="検索キーワードや絞り込み条件を変更してみてください。"
        />
      )}

      {visibleUsers.length > 0 && (
        <AppTable minWidth={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ユーザー名</Table.Th>
              <Table.Th w={140}>ロール</Table.Th>
              <Table.Th>Instructor リンク</Table.Th>
              <Table.Th w={120}>状態</Table.Th>
              <Table.Th w={56} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleUsers.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onEdit={() => setDrawerState({ userId: user.id })}
              />
            ))}
          </Table.Tbody>
        </AppTable>
      )}

      <UserDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type UserRowProps = {
  user: User;
  onEdit: () => void;
};

/** ユーザー一覧の1行。クリックで編集 Drawer を開く。 */
function UserRow({ user, onEdit }: UserRowProps) {
  const deactivate = useDeactivateUser(user.id);
  const activate = useActivateUser(user.id);
  const isActive = user.isActive;
  const roleMeta = ROLE_META[user.role];

  /** 行メニューからのステータス切り替え（無効化⇔アクティブ化）を実行する */
  const handleToggleStatus = () => {
    const mutation = isActive ? deactivate : activate;
    mutation.mutate(undefined, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: `${user.displayName}を${isActive ? '無効化' : 'アクティブ化'}しました`,
        });
      },
    });
  };

  return (
    <ClickableTr onClick={onEdit}>
      <Table.Td>
        <Group gap="sm" wrap="nowrap">
          {user.pictureUrl ? (
            <Avatar src={user.pictureUrl} radius="xl" size="sm" />
          ) : (
            <Avatar color="initials" name={user.displayName} radius="xl" size="sm" />
          )}
          <Text fw={500} size="sm">
            {user.displayName}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <AppBadge kind={roleMeta.badgeKind}>
          {roleMeta.label}
        </AppBadge>
      </Table.Td>
      <Table.Td>
        {user.instructorId ? (
          <AppBadge kind="link">
            リンク済み
          </AppBadge>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <AppBadge kind={isActive ? 'active' : 'inactive'}>
          {isActive ? 'アクティブ' : '無効'}
        </AppBadge>
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
            <Menu.Item
              onClick={handleToggleStatus}
              disabled={deactivate.isPending || activate.isPending}
            >
              {isActive ? '無効化' : 'アクティブ化'}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </ClickableTr>
  );
}
