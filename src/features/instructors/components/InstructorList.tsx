import { useMemo, useState } from 'react';

import { Avatar, Button, Group, Menu, Stack, Table, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconUsers } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppTable } from '@/components/AppTable';
import { ClickableTr } from '@/components/ClickableTr';
import { ListEmptyState, ListNoResultsState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import { ListToolbar } from '@/components/ListToolbar';
import { RowActionsButton } from '@/components/RowActionsButton';
import { SearchInput } from '@/components/SearchInput';
import type { ActiveStatusFilter } from '@/components/status-filter';
import { StatusFilterControl } from '@/components/StatusFilterControl';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useChangeInstructorStatus, useInstructors } from '../queries';
import type { InstructorListItem } from '../schema';
import { InstructorDrawer, type InstructorDrawerState } from './InstructorDrawer';

/** 一覧に表示する資格バッジの最大数（超過分は "+n" にまとめる） */
const MAX_VISIBLE_CERTS = 3;

/** インストラクターの表示名（姓 名）を組み立てる */
function fullNameOf(instructor: InstructorListItem): string {
  return `${instructor.lastName} ${instructor.firstName}`;
}

/** インストラクターのカナ表示名を組み立てる（カナ未登録の場合は null） */
function fullNameKanaOf(instructor: InstructorListItem): string | null {
  return instructor.lastNameKana && instructor.firstNameKana
    ? `${instructor.lastNameKana} ${instructor.firstNameKana}`
    : null;
}

/**
 * インストラクター一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・資格管理・ステータス変更は InstructorDrawer に集約する。
 */
export function InstructorList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActiveStatusFilter>('ALL');
  const [drawerState, setDrawerState] = useState<InstructorDrawerState | null>(null);

  // 管理画面では全ステータスを表示するため ACTIVE / INACTIVE を両方取得する
  const activeData = useInstructors('ACTIVE');
  const inactiveData = useInstructors('INACTIVE');

  const allInstructors = useMemo(
    () => [...(activeData.data ?? []), ...(inactiveData.data ?? [])],
    [activeData.data, inactiveData.data],
  );
  const isLoading = activeData.isLoading || inactiveData.isLoading;
  const isError = activeData.isError || inactiveData.isError;
  const activeCount = allInstructors.filter((i) => i.status === 'ACTIVE').length;

  const visibleInstructors = useMemo(() => {
    const query = search.trim();
    return allInstructors.filter((instructor) => {
      if (statusFilter !== 'ALL' && instructor.status !== statusFilter) return false;
      if (query.length === 0) return true;
      const haystack = `${fullNameOf(instructor)}${fullNameKanaOf(instructor) ?? ''}`;
      return haystack.includes(query);
    });
  }, [allInstructors, statusFilter, search]);

  return (
    <Stack gap="md">
      <ListHeader
        title="インストラクター管理"
        total={allInstructors.length}
        active={activeCount}
        unit="名"
        isLoading={isLoading}
        action={
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setDrawerState({ mode: 'create' })}
          >
            インストラクターを追加
          </Button>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="氏名・カナで検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <StatusFilterControl value={statusFilter} onChange={setStatusFilter} />
      </ListToolbar>

      {isError && <ErrorAlert>インストラクター一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allInstructors.length === 0 && (
        <ListEmptyState
          icon={<IconUsers size={32} stroke={1.5} />}
          title="インストラクターがいません"
          description="最初のインストラクターを追加して名簿を作成しましょう。"
          action={
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              インストラクターを追加
            </Button>
          }
        />
      )}

      {!isLoading && allInstructors.length > 0 && visibleInstructors.length === 0 && (
        <ListNoResultsState title="条件に一致するインストラクターがいません" />
      )}

      {visibleInstructors.length > 0 && (
        <AppTable minWidth={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>氏名</Table.Th>
              <Table.Th>資格</Table.Th>
              <Table.Th w={120}>状態</Table.Th>
              <Table.Th>備考</Table.Th>
              <Table.Th w={56} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleInstructors.map((instructor) => (
              <InstructorRow
                key={instructor.id}
                instructor={instructor}
                onEdit={() => setDrawerState({ mode: 'edit', instructorId: instructor.id })}
              />
            ))}
          </Table.Tbody>
        </AppTable>
      )}

      <InstructorDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type InstructorRowProps = {
  instructor: InstructorListItem;
  onEdit: () => void;
};

/** インストラクター一覧の1行。クリックで編集 Drawer を開く。 */
function InstructorRow({ instructor, onEdit }: InstructorRowProps) {
  const changeStatus = useChangeInstructorStatus(instructor.id);
  const isActive = instructor.status === 'ACTIVE';
  const fullName = fullNameOf(instructor);
  const fullNameKana = fullNameKanaOf(instructor);

  const visibleCerts = instructor.certifications.slice(0, MAX_VISIBLE_CERTS);
  const hiddenCerts = instructor.certifications.slice(MAX_VISIBLE_CERTS);

  const handleToggleStatus = () => {
    const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';
    changeStatus.mutate(
      { status: nextStatus },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: `${fullName}を${nextStatus === 'ACTIVE' ? 'アクティブ' : '非アクティブ'}にしました`,
          });
        },
      },
    );
  };

  return (
    <ClickableTr onClick={onEdit}>
      <Table.Td>
        <Group gap="sm" wrap="nowrap">
          <Avatar color="initials" name={fullName} radius="xl" size="sm" />
          <div>
            <Text fw={500} size="sm">
              {fullName}
            </Text>
            {fullNameKana && (
              <Text c="dimmed" size="xs">
                {fullNameKana}
              </Text>
            )}
          </div>
        </Group>
      </Table.Td>
      <Table.Td>
        {instructor.certifications.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {visibleCerts.map((cert) => (
              <Tooltip key={cert.id} label={cert.name}>
                <AppBadge
                  kind={cert.isActive ? 'certification' : 'inactive'}
                  departmentCode={cert.departmentCode}
                  size="sm"
                >
                  {cert.shortName}
                </AppBadge>
              </Tooltip>
            ))}
            {hiddenCerts.length > 0 && (
              <Tooltip label={hiddenCerts.map((c) => c.name).join('、')}>
                <AppBadge kind="count" size="sm">
                  +{hiddenCerts.length}
                </AppBadge>
              </Tooltip>
            )}
          </Group>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <AppBadge kind={isActive ? 'active' : 'inactive'}>
          {isActive ? 'アクティブ' : '非アクティブ'}
        </AppBadge>
      </Table.Td>
      <Table.Td>
        {instructor.notes && (
          <Text c="dimmed" size="sm" lineClamp={1}>
            {instructor.notes}
          </Text>
        )}
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <Menu position="bottom-end">
          <Menu.Target>
            <RowActionsButton />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onEdit}>編集</Menu.Item>
            <Menu.Item onClick={handleToggleStatus} disabled={changeStatus.isPending}>
              {isActive ? '非アクティブ化' : 'アクティブ化'}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </ClickableTr>
  );
}
