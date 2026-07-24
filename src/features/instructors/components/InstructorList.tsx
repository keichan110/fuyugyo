import { useMemo, useState } from 'react';

import { Avatar, Group, Paper, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconPlus, IconUsers } from '@tabler/icons-react';

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

import { useInstructors } from '../queries';
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
  const [showInactive, setShowInactive] = useState(false);
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

  const visibleInstructors = useMemo(() => {
    const query = search.trim();
    return allInstructors.filter((instructor) => {
      if (!showInactive && instructor.status !== 'ACTIVE') return false;
      if (query.length === 0) return true;
      const haystack = `${fullNameOf(instructor)}${fullNameKanaOf(instructor) ?? ''}`;
      return haystack.includes(query);
    });
  }, [allInstructors, showInactive, search]);

  return (
    <Stack gap="md">
      <ListHeader
        title="インストラクター管理"
        summary={{ count: visibleInstructors.length, unit: '名' }}
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
          placeholder="氏名・カナで検索"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <InactiveVisibilityToggle shown={showInactive} onChange={setShowInactive} />
      </ListToolbar>

      {isError && <ErrorAlert>インストラクター一覧の取得に失敗しました</ErrorAlert>}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && allInstructors.length === 0 && (
        <ListEmptyState
          icon={<IconUsers size={32} stroke={1.5} />}
          title="インストラクターがいません"
          description="最初のインストラクターを追加して名簿を作成しましょう。"
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

      {!isLoading && allInstructors.length > 0 && visibleInstructors.length === 0 && (
        <ListNoResultsState title="条件に一致するインストラクターがいません" />
      )}

      {visibleInstructors.length > 0 && (
        <>
          <Stack visibleFrom="sm" gap={0}>
            <AppTable minWidth={640}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>氏名</Table.Th>
                  <Table.Th>資格</Table.Th>
                  <Table.Th w={120}>状態</Table.Th>
                  <Table.Th>備考</Table.Th>
                  <Table.Th w={72} />
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
          </Stack>
          <Paper hiddenFrom="sm" withBorder p={0}>
            <Stack gap={0}>
              {visibleInstructors.map((instructor) => (
                <InstructorMobileRow
                  key={instructor.id}
                  instructor={instructor}
                  onEdit={() => setDrawerState({ mode: 'edit', instructorId: instructor.id })}
                />
              ))}
            </Stack>
          </Paper>
        </>
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
  const isActive = instructor.status === 'ACTIVE';
  const fullName = fullNameOf(instructor);
  const fullNameKana = fullNameKanaOf(instructor);

  const visibleCerts = instructor.certifications.slice(0, MAX_VISIBLE_CERTS);
  const hiddenCerts = instructor.certifications.slice(MAX_VISIBLE_CERTS);

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
        <AppBadge kind={isActive ? 'active' : 'inactive'}>{isActive ? '有効' : '無効'}</AppBadge>
      </Table.Td>
      <Table.Td>
        {instructor.notes && (
          <Text c="dimmed" size="sm" lineClamp={1}>
            {instructor.notes}
          </Text>
        )}
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <AppButton intent="tertiary" size="xs" onClick={onEdit}>
          編集
        </AppButton>
      </Table.Td>
    </ClickableTr>
  );
}

/** モバイル幅でインストラクターを名簿形式に表示する行。 */
function InstructorMobileRow({ instructor, onEdit }: InstructorRowProps) {
  const fullName = fullNameOf(instructor);
  const fullNameKana = fullNameKanaOf(instructor);
  const visibleCerts = instructor.certifications.slice(0, MAX_VISIBLE_CERTS);
  const hiddenCerts = instructor.certifications.slice(MAX_VISIBLE_CERTS);

  return (
    <div
      className={`${mobileClasses.row}${instructor.status === 'INACTIVE' ? ` ${mobileClasses.inactive}` : ''}`}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Avatar color="initials" name={fullName} radius="xl" size="sm" />
          <Stack gap={4}>
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
            {instructor.certifications.length > 0 && (
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
                  <Tooltip label={hiddenCerts.map((cert) => cert.name).join('、')}>
                    <AppBadge kind="count" size="sm">
                      +{hiddenCerts.length}
                    </AppBadge>
                  </Tooltip>
                )}
              </Group>
            )}
          </Stack>
        </Group>
        <AppButton intent="tertiary" size="xs" onClick={onEdit}>
          編集
        </AppButton>
      </Group>
    </div>
  );
}
