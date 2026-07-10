import { useMemo, useState } from 'react';

import {
  ActionIcon,
  Alert,
  Avatar,
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
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDotsVertical, IconPlus, IconSearch, IconUsers } from '@tabler/icons-react';

import { useChangeInstructorStatus, useInstructors } from '../queries';
import type { InstructorListItem } from '../schema';
import { InstructorDrawer, type InstructorDrawerState } from './InstructorDrawer';

/** 一覧に表示する資格バッジの最大数（超過分は "+n" にまとめる） */
const MAX_VISIBLE_CERTS = 3;

/** ステータス絞り込みの選択肢 */
const STATUS_FILTERS = [
  { label: 'すべて', value: 'ALL' },
  { label: 'アクティブ', value: 'ACTIVE' },
  { label: '非アクティブ', value: 'INACTIVE' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
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
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>インストラクター管理</Title>
          {!isLoading && (
            <Text c="dimmed" size="sm">
              全{allInstructors.length}名（アクティブ{activeCount}名）
            </Text>
          )}
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDrawerState({ mode: 'create' })}
        >
          インストラクターを追加
        </Button>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="氏名・カナで検索"
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

      {isError && <Alert color="red">インストラクター一覧の取得に失敗しました</Alert>}

      {isLoading && (
        <Stack gap="xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={52} radius="sm" />
          ))}
        </Stack>
      )}

      {!isLoading && allInstructors.length === 0 && (
        <EmptyState
          icon={<IconUsers size={32} stroke={1.5} />}
          title="インストラクターがいません"
          description="最初のインストラクターを追加して名簿を作成しましょう。"
        >
          <EmptyState.Actions>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDrawerState({ mode: 'create' })}
            >
              インストラクターを追加
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      )}

      {!isLoading && allInstructors.length > 0 && visibleInstructors.length === 0 && (
        <EmptyState
          icon={<IconSearch size={32} stroke={1.5} />}
          title="条件に一致するインストラクターがいません"
          description="検索キーワードや絞り込み条件を変更してみてください。"
        />
      )}

      {visibleInstructors.length > 0 && (
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover withTableBorder withRowBorders verticalSpacing="sm">
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
          </Table>
        </Table.ScrollContainer>
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
    <Table.Tr onClick={onEdit} style={{ cursor: 'pointer' }}>
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
                <Badge variant="light" color={cert.isActive ? 'blue' : 'gray'} size="sm">
                  {cert.shortName}
                </Badge>
              </Tooltip>
            ))}
            {hiddenCerts.length > 0 && (
              <Tooltip label={hiddenCerts.map((c) => c.name).join('、')}>
                <Badge variant="outline" color="gray" size="sm">
                  +{hiddenCerts.length}
                </Badge>
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
        <Badge color={isActive ? 'green' : 'gray'} variant="light">
          {isActive ? 'アクティブ' : '非アクティブ'}
        </Badge>
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
            <ActionIcon variant="subtle" color="gray">
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onEdit}>編集</Menu.Item>
            <Menu.Item onClick={handleToggleStatus} disabled={changeStatus.isPending}>
              {isActive ? '非アクティブ化' : 'アクティブ化'}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}
