import { useMemo, useState } from 'react';

import { Avatar, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';
import { AppTable } from '@/components/AppTable';
import { ClickableTr } from '@/components/ClickableTr';
import { InactiveVisibilityToggle } from '@/components/InactiveVisibilityToggle';
import { ListEmptyState, ListNoResultsState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import { ListToolbar } from '@/components/ListToolbar';
import mobileClasses from '@/components/MobileListItem.module.css';
import { SearchInput } from '@/components/SearchInput';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useUsers } from '../queries';
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
  const [showInactive, setShowInactive] = useState(false);
  const [drawerState, setDrawerState] = useState<UserDrawerState | null>(null);

  const { data, isLoading, isError } = useUsers();
  const allUsers = useMemo(() => data ?? [], [data]);

  const visibleUsers = useMemo(() => {
    const query = search.trim();
    return allUsers.filter((user) => {
      if (!showInactive && !user.isActive) return false;
      if (query.length === 0) return true;
      return user.displayName.includes(query);
    });
  }, [allUsers, showInactive, search]);

  return (
    <Stack gap="md">
      <ListHeader
        title="ユーザー管理"
        summary={{ count: visibleUsers.length, unit: '名' }}
        isLoading={isLoading}
      />

      <ListToolbar>
        <SearchInput
          placeholder="ユーザー名で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <InactiveVisibilityToggle shown={showInactive} onChange={setShowInactive} />
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
        <>
          <Stack visibleFrom="sm" gap={0}>
            <AppTable minWidth={640}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ユーザー名</Table.Th>
                  <Table.Th w={140}>ロール</Table.Th>
                  <Table.Th>Instructor リンク</Table.Th>
                  <Table.Th w={120}>状態</Table.Th>
                  <Table.Th w={72} />
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
          </Stack>
          <Stack hiddenFrom="sm" gap="sm">
            {visibleUsers.map((user) => (
              <UserMobileRow
                key={user.id}
                user={user}
                onEdit={() => setDrawerState({ userId: user.id })}
              />
            ))}
          </Stack>
        </>
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
  const isActive = user.isActive;
  const roleMeta = USER_ROLE_META[user.role];

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
        <AppBadge kind={roleMeta.badgeKind}>{roleMeta.label}</AppBadge>
      </Table.Td>
      <Table.Td>
        {user.instructorId ? (
          <AppBadge kind="link">リンク済み</AppBadge>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <AppBadge kind={isActive ? 'active' : 'inactive'}>{isActive ? '有効' : '無効'}</AppBadge>
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <AppButton intent="tertiary" size="xs" onClick={onEdit}>
          編集
        </AppButton>
      </Table.Td>
    </ClickableTr>
  );
}

/** モバイル幅でユーザーを名簿形式に表示する行。 */
function UserMobileRow({ user, onEdit }: UserRowProps) {
  const roleMeta = USER_ROLE_META[user.role];

  return (
    <Paper withBorder p="sm" className={!user.isActive ? mobileClasses.inactive : undefined}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {user.pictureUrl ? (
            <Avatar src={user.pictureUrl} radius="xl" size="sm" />
          ) : (
            <Avatar color="initials" name={user.displayName} radius="xl" size="sm" />
          )}
          <Stack gap={4}>
            <Text fw={500} size="sm">
              {user.displayName}
            </Text>
            <Group gap="xs">
              <AppBadge kind={roleMeta.badgeKind} size="sm">
                {roleMeta.label}
              </AppBadge>
              {user.instructorId && <AppBadge kind="link">リンク済み</AppBadge>}
            </Group>
          </Stack>
        </Group>
        <AppButton intent="tertiary" size="xs" onClick={onEdit}>
          編集
        </AppButton>
      </Group>
    </Paper>
  );
}
