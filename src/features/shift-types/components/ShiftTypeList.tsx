import { useMemo, useState, type ReactNode } from 'react';

import { Group, Paper, Stack, Table, Text } from '@mantine/core';
import { IconClock, IconPlus } from '@tabler/icons-react';

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

import { useShiftTypes } from '../queries';
import type { ShiftTypeListItem } from '../schema';
import { ShiftTypeDrawer, type ShiftTypeDrawerState } from './ShiftTypeDrawer';

/**
 * テーブルの各行に表示する任意の操作。
 */
type ShiftTypeListProps = {
  renderRowAction?: (shiftType: ShiftTypeListItem) => ReactNode;
  /** 任意の行操作列の見出し。 */
  rowActionHeader?: ReactNode;
  /** Drawerを親で管理する場合のフォーム開始処理。 */
  onOpenForm?: (state: ShiftTypeDrawerState) => void;
};

/** シフト種別マスタの検索・絞り込みと新規登録・編集を提供する一覧。 */
export function ShiftTypeList({
  renderRowAction,
  rowActionHeader,
  onOpenForm,
}: ShiftTypeListProps) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [drawerState, setDrawerState] = useState<ShiftTypeDrawerState | null>(null);

  // 管理画面では無効種別も表示するため全件取得する
  const { data, isLoading, isError } = useShiftTypes(false);

  const allShiftTypes = useMemo(() => data ?? [], [data]);

  const visibleShiftTypes = useMemo(() => {
    const query = search.trim();
    return allShiftTypes.filter((shiftType) => {
      if (!showInactive && !shiftType.isActive) return false;
      if (query.length === 0) return true;
      return shiftType.name.includes(query);
    });
  }, [allShiftTypes, showInactive, search]);

  return (
    <Stack gap="md">
      <ListHeader
        title="シフト種別マスタ"
        summary={{ count: visibleShiftTypes.length, unit: '件' }}
        isLoading={isLoading}
        action={
          <AppButton
            intent="secondary"
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              onOpenForm ? onOpenForm({ mode: 'create' }) : setDrawerState({ mode: 'create' })
            }
          >
            登録
          </AppButton>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="種別名で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <InactiveVisibilityToggle shown={showInactive} onChange={setShowInactive} />
      </ListToolbar>

      {isError && <ErrorAlert>シフト種別一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allShiftTypes.length === 0 && (
        <ListEmptyState
          icon={<IconClock size={32} stroke={1.5} />}
          title="シフト種別がありません"
          description="最初のシフト種別をマスタに登録しましょう。"
          action={
            <AppButton
              intent="primary"
              leftSection={<IconPlus size={16} />}
              onClick={() =>
                onOpenForm ? onOpenForm({ mode: 'create' }) : setDrawerState({ mode: 'create' })
              }
            >
              シフト種別を新規登録
            </AppButton>
          }
        />
      )}

      {!isLoading && allShiftTypes.length > 0 && visibleShiftTypes.length === 0 && (
        <ListNoResultsState title="条件に一致するシフト種別がありません" />
      )}

      {visibleShiftTypes.length > 0 && (
        <>
          <Stack visibleFrom="sm" gap={0}>
            <AppTable minWidth={400}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>種別名</Table.Th>
                  <Table.Th w={120}>状態</Table.Th>
                  {renderRowAction && <Table.Th w={48}>{rowActionHeader}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleShiftTypes.map((shiftType) => (
                  <ShiftTypeRow
                    key={shiftType.id}
                    shiftType={shiftType}
                    rowAction={renderRowAction?.(shiftType)}
                    onEdit={() =>
                      onOpenForm
                        ? onOpenForm({ mode: 'edit', shiftTypeId: shiftType.id })
                        : setDrawerState({ mode: 'edit', shiftTypeId: shiftType.id })
                    }
                  />
                ))}
              </Table.Tbody>
            </AppTable>
          </Stack>
          <Paper hiddenFrom="sm" withBorder p={0}>
            <Stack gap={0}>
              {visibleShiftTypes.map((shiftType) => (
                <ShiftTypeMobileRow
                  key={shiftType.id}
                  shiftType={shiftType}
                  rowAction={renderRowAction?.(shiftType)}
                  onEdit={() =>
                    onOpenForm
                      ? onOpenForm({ mode: 'edit', shiftTypeId: shiftType.id })
                      : setDrawerState({ mode: 'edit', shiftTypeId: shiftType.id })
                  }
                />
              ))}
            </Stack>
          </Paper>
        </>
      )}

      {!onOpenForm && <ShiftTypeDrawer state={drawerState} onClose={() => setDrawerState(null)} />}
    </Stack>
  );
}

/** モバイル幅でシフト種別を名簿形式に表示する行。 */
function ShiftTypeMobileRow({ shiftType, rowAction, onEdit }: ShiftTypeRowProps) {
  return (
    <div
      className={`${mobileClasses.row}${!shiftType.isActive ? ` ${mobileClasses.inactive}` : ''}`}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw={500} size="sm">
          {shiftType.name}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {rowAction}
          <AppButton intent="tertiary" size="xs" onClick={onEdit}>
            編集
          </AppButton>
        </Group>
      </Group>
    </div>
  );
}

type ShiftTypeRowProps = {
  shiftType: ShiftTypeListItem;
  rowAction?: ReactNode;
  onEdit: () => void;
};

/** シフト種別一覧の1行。クリックで編集 Drawer を開く。 */
function ShiftTypeRow({ shiftType, rowAction, onEdit }: ShiftTypeRowProps) {
  const isActive = shiftType.isActive;
  return (
    <ClickableTr onClick={onEdit}>
      <Table.Td>
        <Text fw={500} size="sm">
          {shiftType.name}
        </Text>
      </Table.Td>
      <Table.Td>
        <AppBadge kind={isActive ? 'active' : 'inactive'}>{isActive ? '有効' : '無効'}</AppBadge>
      </Table.Td>
      {rowAction && <Table.Td onClick={(event) => event.stopPropagation()}>{rowAction}</Table.Td>}
    </ClickableTr>
  );
}
