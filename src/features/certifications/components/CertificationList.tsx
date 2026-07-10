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
import { IconCertificate, IconPlus } from '@tabler/icons-react';

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
import { useDepartments } from '@/features/departments/queries';

import { useCertifications, useDeactivateCertification } from '../queries';
import type { Certification } from '../schema';
import { CertificationDrawer, type CertificationDrawerState } from './CertificationDrawer';

/**
 * 資格一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・ステータス変更は CertificationDrawer に集約する。
 */
export function CertificationList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActiveStatusFilter>('ALL');
  const [drawerState, setDrawerState] = useState<CertificationDrawerState | null>(null);

  // 管理画面では無効資格も表示するため全件取得する
  const { data, isLoading, isError } = useCertifications(false);
  const { data: departments } = useDepartments(false);

  const certifications = useMemo(() => data ?? [], [data]);
  const activeCount = certifications.filter((c) => c.isActive).length;

  /** departmentId → name のマップ */
  const deptNameMap = useMemo(
    () => new Map(departments?.map((d) => [d.id, d.name]) ?? []),
    [departments],
  );

  const visibleCertifications = useMemo(() => {
    const query = search.trim();
    return certifications.filter((cert) => {
      if (statusFilter === 'ACTIVE' && !cert.isActive) return false;
      if (statusFilter === 'INACTIVE' && cert.isActive) return false;
      if (query.length === 0) return true;
      const haystack = `${cert.name}${cert.shortName}${cert.organization}`;
      return haystack.includes(query);
    });
  }, [certifications, statusFilter, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>資格管理</Title>
          {!isLoading && (
            <Text c="dimmed" size="sm">
              全{certifications.length}件（アクティブ{activeCount}件）
            </Text>
          )}
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDrawerState({ mode: 'create' })}
        >
          資格を追加
        </Button>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <SearchInput
          placeholder="資格名・略称・発行団体で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <StatusFilterControl value={statusFilter} onChange={setStatusFilter} />
      </Group>

      {isError && <ErrorAlert>資格一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && certifications.length === 0 && (
        <ListEmptyState
          icon={<IconCertificate size={32} stroke={1.5} />}
          title="資格がありません"
          description="最初の資格を追加して管理を始めましょう。"
          action={
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              資格を追加
            </Button>
          }
        />
      )}

      {!isLoading && certifications.length > 0 && visibleCertifications.length === 0 && (
        <ListNoResultsState title="条件に一致する資格がいません" />
      )}

      {visibleCertifications.length > 0 && (
        <AppTable minWidth={720}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>資格名</Table.Th>
              <Table.Th>部門</Table.Th>
              <Table.Th>発行団体</Table.Th>
              <Table.Th w={100}>状態</Table.Th>
              <Table.Th w={56} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleCertifications.map((cert) => (
              <CertificationRow
                key={cert.id}
                certification={cert}
                departmentName={deptNameMap.get(cert.departmentId)}
                onEdit={() => setDrawerState({ mode: 'edit', certificationId: cert.id })}
              />
            ))}
          </Table.Tbody>
        </AppTable>
      )}

      <CertificationDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type CertificationRowProps = {
  certification: Certification;
  departmentName: string | undefined;
  onEdit: () => void;
};

/** 資格一覧の1行。クリックで編集 Drawer を開く。 */
function CertificationRow({ certification, departmentName, onEdit }: CertificationRowProps) {
  const deactivate = useDeactivateCertification();
  const isActive = certification.isActive;

  const handleDeactivate = () => {
    deactivate.mutate(certification.id, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: `${certification.name}を無効化しました`,
        });
      },
    });
  };

  return (
    <ClickableTr onClick={onEdit}>
      <Table.Td>
        <Text fw={500} size="sm">
          {certification.name}
        </Text>
        <Text c="dimmed" size="xs">
          {certification.shortName}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{departmentName ?? '—'}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{certification.organization}</Text>
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
