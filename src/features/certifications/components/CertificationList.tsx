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
import { IconCertificate, IconDotsVertical, IconPlus, IconSearch } from '@tabler/icons-react';

import { useDepartments } from '@/features/departments/queries';

import { useCertifications, useDeactivateCertification } from '../queries';
import type { Certification } from '../schema';
import { CertificationDrawer, type CertificationDrawerState } from './CertificationDrawer';

/** ステータス絞り込みの選択肢 */
const STATUS_FILTERS = [
  { label: 'すべて', value: 'ALL' },
  { label: 'アクティブ', value: 'ACTIVE' },
  { label: '無効', value: 'INACTIVE' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

/**
 * 資格一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・ステータス変更は CertificationDrawer に集約する。
 */
export function CertificationList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
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
        <TextInput
          placeholder="資格名・略称・発行団体で検索"
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

      {isError && <Alert color="red">資格一覧の取得に失敗しました</Alert>}

      {isLoading && (
        <Stack gap="xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={52} radius="sm" />
          ))}
        </Stack>
      )}

      {!isLoading && certifications.length === 0 && (
        <EmptyState
          icon={<IconCertificate size={32} stroke={1.5} />}
          title="資格がありません"
          description="最初の資格を追加して管理を始めましょう。"
        >
          <EmptyState.Actions>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              資格を追加
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      )}

      {!isLoading && certifications.length > 0 && visibleCertifications.length === 0 && (
        <EmptyState
          icon={<IconSearch size={32} stroke={1.5} />}
          title="条件に一致する資格がいません"
          description="検索キーワードや絞り込み条件を変更してみてください。"
        />
      )}

      {visibleCertifications.length > 0 && (
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover withTableBorder withRowBorders verticalSpacing="sm">
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
          </Table>
        </Table.ScrollContainer>
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
    <Table.Tr onClick={onEdit} style={{ cursor: 'pointer' }}>
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
        <Badge color={isActive ? 'green' : 'gray'} variant="light">
          {isActive ? 'アクティブ' : '無効'}
        </Badge>
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <Menu shadow="md" position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray">
              <IconDotsVertical size={16} />
            </ActionIcon>
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
    </Table.Tr>
  );
}
