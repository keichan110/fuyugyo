import { useState } from 'react';

import { Alert, Badge, Button, Group, Select, Stack, Table, Text, Title } from '@mantine/core';

import { useInstructors } from '@/features/instructors/queries';

import {
  useActivateUser,
  useChangeRole,
  useDeactivateUser,
  useLinkInstructor,
  useUnlinkInstructor,
  useUsers,
} from '../queries';
import type { User } from '../schema';
import { userRoleSchema, type UserRole } from '../schema';

/** ロールの表示名 */
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: '管理者',
  MANAGER: 'マネージャー',
  MEMBER: 'メンバー',
};

/** テーブルの列数（操作モードの colSpan に使用） */
const COL_COUNT = 3;

/**
 * ユーザー一覧・ロール変更・無効化・Instructor リンク操作を提供するコンポーネント（ADMIN 専用）。
 */
export function UserList() {
  const { data: userList, isLoading, isError } = useUsers();

  return (
    <Stack gap="md">
      <Title order={2}>ユーザー管理</Title>

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">ユーザー一覧の取得に失敗しました</Alert>}

      {!isLoading && userList?.length === 0 && (
        <Text c="dimmed" size="sm">
          ユーザーがいません
        </Text>
      )}

      {userList && userList.length > 0 && (
        <Table.ScrollContainer minWidth={500}>
          <Table highlightOnHover withTableBorder withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ユーザー名</Table.Th>
                <Table.Th w={120}>ロール</Table.Th>
                <Table.Th w={300}>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {userList.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

type UserRowProps = {
  user: User;
};

/** ユーザーの1行表示。操作モードを切り替える。 */
function UserRow({ user }: UserRowProps) {
  const [mode, setMode] = useState<'display' | 'change-role' | 'link-instructor'>('display');

  if (mode === 'change-role') {
    return <UserRoleChanger user={user} onBack={() => setMode('display')} />;
  }
  if (mode === 'link-instructor') {
    return <UserInstructorLinker user={user} onBack={() => setMode('display')} />;
  }
  return (
    <UserRowDisplay
      user={user}
      onChangeRole={() => setMode('change-role')}
      onLinkInstructor={() => setMode('link-instructor')}
    />
  );
}

type UserRowDisplayProps = {
  user: User;
  onChangeRole: () => void;
  onLinkInstructor: () => void;
};

/** ユーザーの表示モード。無効化・アクティブ化ボタンを持つ。 */
function UserRowDisplay({ user, onChangeRole, onLinkInstructor }: UserRowDisplayProps) {
  const deactivate = useDeactivateUser(user.id);
  const activate = useActivateUser(user.id);

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{user.displayName}</Text>
          {!user.isActive && (
            <Badge color="red" variant="light" size="sm">
              無効
            </Badge>
          )}
          {user.instructorId && (
            <Badge color="blue" variant="light" size="sm">
              Instructor リンク済み
            </Badge>
          )}
        </Group>
        {deactivate.isError && (
          <Alert color="red" mt="xs">
            {deactivate.error.message}
          </Alert>
        )}
        {activate.isError && (
          <Alert color="red" mt="xs">
            {activate.error.message}
          </Alert>
        )}
      </Table.Td>
      <Table.Td>
        <Badge color="gray" variant="light" size="sm">
          {ROLE_LABELS[user.role]}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button variant="outline" size="xs" onClick={onChangeRole}>
            ロール変更
          </Button>
          <Button variant="outline" size="xs" onClick={onLinkInstructor}>
            Instructor リンク
          </Button>
          {user.isActive ? (
            <Button
              variant="outline"
              size="xs"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate()}
            >
              無効化
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              loading={activate.isPending}
              onClick={() => activate.mutate()}
            >
              アクティブ化
            </Button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

type UserRoleChangerProps = {
  user: User;
  onBack: () => void;
};

/** ロール変更パネル。セレクトボックスでロールを選んで PATCH する。 */
function UserRoleChanger({ user, onBack }: UserRoleChangerProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const changeRole = useChangeRole(user.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    changeRole.mutate({ role }, { onSuccess: onBack });
  };

  return (
    <Table.Tr>
      <Table.Td colSpan={COL_COUNT}>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>{user.displayName} — ロール変更</Text>
            <Button type="button" variant="outline" size="xs" onClick={onBack}>
              戻る
            </Button>
          </Group>
          <Group component="form" onSubmit={handleSubmit} align="flex-end">
            <Select
              data={userRoleSchema.options.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              value={role}
              onChange={(value) => setRole(userRoleSchema.parse(value))}
              style={{ flex: 1 }}
            />
            <Button
              type="submit"
              size="xs"
              loading={changeRole.isPending}
              disabled={role === user.role}
            >
              保存
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={onBack}>
              キャンセル
            </Button>
          </Group>
          {changeRole.isError && <Alert color="red">{changeRole.error.message}</Alert>}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

type UserInstructorLinkerProps = {
  user: User;
  onBack: () => void;
};

/**
 * Instructor リンク管理パネル。
 * アクティブ Instructor を一覧表示し、リンク・解除を操作する。
 */
function UserInstructorLinker({ user, onBack }: UserInstructorLinkerProps) {
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const { data: activeInstructors } = useInstructors('ACTIVE');
  const linkInstructor = useLinkInstructor(user.id);
  const unlinkInstructor = useUnlinkInstructor(user.id);

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstructorId) return;
    linkInstructor.mutate({ instructorId: selectedInstructorId }, { onSuccess: onBack });
  };

  const handleUnlink = () => {
    unlinkInstructor.mutate(undefined, { onSuccess: onBack });
  };

  const linkedInstructor = activeInstructors?.find((i) => i.id === user.instructorId);

  return (
    <Table.Tr>
      <Table.Td colSpan={COL_COUNT}>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>{user.displayName} — Instructor リンク</Text>
            <Button type="button" variant="outline" size="xs" onClick={onBack}>
              戻る
            </Button>
          </Group>

          {/* 現在のリンク状態 */}
          {user.instructorId ? (
            <Group justify="space-between" bg="gray.0" px="sm" py="xs" style={{ borderRadius: 6 }}>
              <Text size="sm">
                リンク中:{' '}
                {linkedInstructor
                  ? `${linkedInstructor.lastName} ${linkedInstructor.firstName}`
                  : 'インストラクター情報を取得できません'}
              </Text>
              <Button
                type="button"
                variant="outline"
                size="xs"
                loading={unlinkInstructor.isPending}
                onClick={handleUnlink}
              >
                リンク解除
              </Button>
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              Instructor にリンクされていません
            </Text>
          )}

          {/* リンクフォーム */}
          {!user.instructorId && activeInstructors && activeInstructors.length > 0 && (
            <Group component="form" onSubmit={handleLink} wrap="nowrap">
              <Select
                placeholder="インストラクターを選択してください"
                required
                data={activeInstructors.map((inst) => ({
                  value: inst.id,
                  label:
                    inst.lastNameKana && inst.firstNameKana
                      ? `${inst.lastName} ${inst.firstName}（${inst.lastNameKana} ${inst.firstNameKana}）`
                      : `${inst.lastName} ${inst.firstName}`,
                }))}
                value={selectedInstructorId || null}
                onChange={(value) => setSelectedInstructorId(value ?? '')}
                style={{ flex: 1 }}
              />
              <Button
                type="submit"
                size="xs"
                loading={linkInstructor.isPending}
                disabled={!selectedInstructorId}
              >
                リンク
              </Button>
            </Group>
          )}

          {linkInstructor.isError && <Alert color="red">{linkInstructor.error.message}</Alert>}
          {unlinkInstructor.isError && <Alert color="red">{unlinkInstructor.error.message}</Alert>}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}
