import { useMemo, useState } from 'react';

import {
  Button,
  Group,
  Menu,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClock, IconPlus } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppTable } from '@/components/AppTable';
import { ClickableTr } from '@/components/ClickableTr';
import { ListEmptyState, ListNoResultsState } from '@/components/ListEmptyState';
import { RowActionsButton } from '@/components/RowActionsButton';
import { SearchInput } from '@/components/SearchInput';
import { StatusFilterControl } from '@/components/StatusFilterControl';
import type { ActiveStatusFilter } from '@/components/status-filter';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useDeactivateShiftType, useShiftTypes } from '../queries';
import type { ShiftType } from '../schema';
import { ShiftTypeDrawer, type ShiftTypeDrawerState } from './ShiftTypeDrawer';

/**
 * シフト種別一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・無効化は ShiftTypeDrawer に集約する。
 */
export function ShiftTypeList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActiveStatusFilter>('ALL');
  const [drawerState, setDrawerState] = useState<ShiftTypeDrawerState | null>(null);

  // 管理画面では無効種別も表示するため全件取得する
  const { data, isLoading, isError } = useShiftTypes(false);

  const allShiftTypes = useMemo(() => data ?? [], [data]);
  const activeCount = allShiftTypes.filter((s) => s.isActive).length;

  const visibleShiftTypes = useMemo(() => {
    const query = search.trim();
    return allShiftTypes.filter((shiftType) => {
      if (statusFilter === 'ACTIVE' && !shiftType.isActive) return false;
      if (statusFilter === 'INACTIVE' && shiftType.isActive) return false;
      if (query.length === 0) return true;
      return shiftType.name.includes(query);
    });
  }, [allShiftTypes, statusFilter, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>シフト種別管理</Title>
          {!isLoading && (
            <Text c="dimmed" size="sm">
              全{allShiftTypes.length}件（アクティブ{activeCount}件）
            </Text>
          )}
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDrawerState({ mode: 'create' })}
        >
          シフト種別を追加
        </Button>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <SearchInput
          placeholder="種別名で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <StatusFilterControl value={statusFilter} onChange={setStatusFilter} />
      </Group>

      {isError && <ErrorAlert>シフト種別一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allShiftTypes.length === 0 && (
        <ListEmptyState
          icon={<IconClock size={32} stroke={1.5} />}
          title="シフト種別がありません"
          description="最初のシフト種別を追加しましょう。"
          action={
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              シフト種別を追加
            </Button>
          }
        />
      )}

      {!isLoading && allShiftTypes.length > 0 && visibleShiftTypes.length === 0 && (
        <ListNoResultsState title="条件に一致するシフト種別がありません" />
      )}

      {visibleShiftTypes.length > 0 && (
        <AppTable minWidth={400}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>種別名</Table.Th>
              <Table.Th w={120}>状態</Table.Th>
              <Table.Th w={56} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleShiftTypes.map((shiftType) => (
              <ShiftTypeRow
                key={shiftType.id}
                shiftType={shiftType}
                onEdit={() => setDrawerState({ mode: 'edit', shiftTypeId: shiftType.id })}
              />
            ))}
          </Table.Tbody>
        </AppTable>
      )}

      <ShiftTypeDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type ShiftTypeRowProps = {
  shiftType: ShiftType;
  onEdit: () => void;
};

/** シフト種別一覧の1行。クリックで編集 Drawer を開く。 */
function ShiftTypeRow({ shiftType, onEdit }: ShiftTypeRowProps) {
  const deactivate = useDeactivateShiftType();
  const isActive = shiftType.isActive;

  const handleDeactivate = () => {
    deactivate.mutate(shiftType.id, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: `${shiftType.name}を無効化しました`,
        });
      },
    });
  };

  return (
    <ClickableTr onClick={onEdit}>
      <Table.Td>
        <Text fw={500} size="sm">
          {shiftType.name}
        </Text>
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
            {isActive && (
              <Menu.Item onClick={handleDeactivate} disabled={deactivate.isPending}>
                無効化
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </ClickableTr>
  );
}
