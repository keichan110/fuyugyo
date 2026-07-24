import { useMemo, useState } from 'react';

import { Group, Paper, Stack, Table, Text } from '@mantine/core';
import { IconCertificate, IconPlus } from '@tabler/icons-react';

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
import { DepartmentTag } from '@/features/departments/DepartmentTag';

import { useCertifications } from '../queries';
import type { Certification } from '../schema';
import { CertificationDrawer, type CertificationDrawerState } from './CertificationDrawer';

/**
 * 資格一覧と検索・絞り込み、作成・編集への導線を提供するコンポーネント。
 * 作成・編集・ステータス変更は CertificationDrawer に集約する。
 */
export function CertificationList() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [drawerState, setDrawerState] = useState<CertificationDrawerState | null>(null);

  // 管理画面では無効資格も表示するため全件取得する
  const { data, isLoading, isError } = useCertifications(false);

  const certifications = useMemo(() => data ?? [], [data]);

  const visibleCertifications = useMemo(() => {
    const query = search.trim();
    return certifications.filter((cert) => {
      if (!showInactive && !cert.isActive) return false;
      if (query.length === 0) return true;
      const haystack = `${cert.name}${cert.shortName}${cert.organization}`;
      return haystack.includes(query);
    });
  }, [certifications, showInactive, search]);

  return (
    <Stack gap="md">
      <ListHeader
        title="資格管理"
        summary={{ count: visibleCertifications.length, unit: '件' }}
        isLoading={isLoading}
        action={
          <AppButton
            intent="secondary"
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={() => setDrawerState({ mode: 'create' })}
          >
            登録
          </AppButton>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="資格名・略称・発行団体で検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <InactiveVisibilityToggle shown={showInactive} onChange={setShowInactive} />
      </ListToolbar>

      {isError && <ErrorAlert>資格一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && certifications.length === 0 && (
        <ListEmptyState
          icon={<IconCertificate size={32} stroke={1.5} />}
          title="資格がありません"
          description="最初の資格を追加して管理を始めましょう。"
          action={
            <AppButton
              intent="primary"
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              登録
            </AppButton>
          }
        />
      )}

      {!isLoading && certifications.length > 0 && visibleCertifications.length === 0 && (
        <ListNoResultsState title="条件に一致する資格がいません" />
      )}

      {visibleCertifications.length > 0 && (
        <>
          <Stack visibleFrom="sm" gap={0}>
            <AppTable minWidth={720}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>資格名</Table.Th>
                  <Table.Th>部門</Table.Th>
                  <Table.Th>発行団体</Table.Th>
                  <Table.Th w={100}>状態</Table.Th>
                  <Table.Th w={72} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleCertifications.map((cert) => (
                  <CertificationRow
                    key={cert.id}
                    certification={cert}
                    onEdit={() => setDrawerState({ mode: 'edit', certificationId: cert.id })}
                  />
                ))}
              </Table.Tbody>
            </AppTable>
          </Stack>
          <Stack hiddenFrom="sm" gap="sm">
            {visibleCertifications.map((cert) => (
              <CertificationMobileRow
                key={cert.id}
                certification={cert}
                onEdit={() => setDrawerState({ mode: 'edit', certificationId: cert.id })}
              />
            ))}
          </Stack>
        </>
      )}

      <CertificationDrawer state={drawerState} onClose={() => setDrawerState(null)} />
    </Stack>
  );
}

type CertificationRowProps = {
  certification: Certification;
  onEdit: () => void;
};

/** 資格一覧の1行。クリックで編集 Drawer を開く。 */
function CertificationRow({ certification, onEdit }: CertificationRowProps) {
  const isActive = certification.isActive;

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
        <DepartmentTag code={certification.departmentCode} />
      </Table.Td>
      <Table.Td>
        <Text size="sm">{certification.organization}</Text>
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

/** モバイル幅で資格を名簿形式に表示する行。 */
function CertificationMobileRow({ certification, onEdit }: CertificationRowProps) {
  return (
    <Paper
      withBorder
      p="sm"
      className={!certification.isActive ? mobileClasses.inactive : undefined}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Text fw={500} size="sm">
            {certification.name}
          </Text>
          <Group gap="xs">
            <DepartmentTag code={certification.departmentCode} />
            <Text c="dimmed" size="xs">
              {certification.shortName}
            </Text>
          </Group>
          <Text c="dimmed" size="sm">
            {certification.organization}
          </Text>
        </Stack>
        <AppButton intent="tertiary" size="xs" onClick={onEdit}>
          編集
        </AppButton>
      </Group>
    </Paper>
  );
}
