import { useMemo, useState } from 'react';

import {
  Avatar,
  Group,
  Menu,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUsers } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppTable } from '@/components/AppTable';
import { ClickableTr } from '@/components/ClickableTr';
import { ListEmptyState, ListNoResultsState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import { ListToolbar } from '@/components/ListToolbar';
import { RowActionsButton } from '@/components/RowActionsButton';
import { SearchInput } from '@/components/SearchInput';
import { StatusFilterControl } from '@/components/StatusFilterControl';
import type { ActiveStatusFilter } from '@/components/status-filter';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useActivateUser, useDeactivateUser, useUsers } from '../queries';
import { USER_ROLE_META } from '../role-meta';
import type { User } from '../schema';
import { UserDrawer, type UserDrawerState } from './UserDrawer';

/**
 * ユーザー一覧と検索・絞り込み、編集への導線を提供するコンポーネント（ADMIN 専用）。
 * ユーザーは LINE 招待経由で登録されるため作成導線は持たず、ロール変更・
 * Instructor リンク・ステータス変更は UserDrawer に集約する。
 */
export function UserList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActiveStatusFilter>('ALL');
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
      <ListHeader
        title="ユーザー管理"
        total={allUsers.length}
        active={activeCount}
        unit="名"
        isLoading={isLoading}
      />

      <ListToolbar>
        <SearchInput
          placeholder="ユーザー名で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <StatusFilterControl value={statusFilter} onChange={setStatusFilter} />
      </ListToolbar>

      {isError && <ErrorAlert>ユーザー一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allUsers.length === 0 && (
        <ListEmptyState icon={<IconUsers size={32} stroke={1.5} />} title="ユーザーがいません" />
      )}

      {!isLoading && allUsers.length > 0 && visibleUsers.length === 0 && (
        <ListNoResultsState title="条件に一致するユーザーがいません" />
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
  const roleMeta = USER_ROLE_META[user.role];

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
            <RowActionsButton />
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
