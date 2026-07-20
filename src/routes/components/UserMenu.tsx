import { Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

import { AppButton } from '@/components/AppButton';
import { useLogout, useUnlinkInstructor } from '@/features/auth/queries';
import type { MeResponse } from '@/features/auth/schema';
import { useInstructor } from '@/features/instructors/queries';

/** アバター + ログアウトメニュー（全ユーザー共通） */
export function UserMenu({ user }: { user: MeResponse }) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <Menu width={240} position="bottom-end">
      <Menu.Target>
        <UnstyledButton>
          <Avatar
            src={user.pictureUrl}
            name={user.displayName}
            color="initials"
            radius="xl"
            size="sm"
          />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{user.displayName}</Menu.Label>
        {user.instructorId && <InstructorLinkMenuSection instructorId={user.instructorId} />}
        <Menu.Divider />
        <Menu.Item
          onClick={() => {
            // ログアウト後は保護ルート上に取り残されないようルートへ遷移する
            logout.mutate(undefined, { onSuccess: () => void navigate({ to: '/' }) });
          }}
        >
          ログアウト
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** アバターメニュー内に連携中のインストラクターと解除操作を表示する。 */
function InstructorLinkMenuSection({ instructorId }: { instructorId: string }) {
  const { data: instructor } = useInstructor(instructorId);
  const unlinkInstructor = useUnlinkInstructor();

  return (
    <>
      <Menu.Divider />
      <Menu.Label>インストラクター連携</Menu.Label>
      <Group px="sm" pb="xs" gap="xs" wrap="nowrap">
        <Text size="sm" truncate flex={1}>
          {instructor ? `${instructor.lastName} ${instructor.firstName}` : '連携情報を読み込み中'}
        </Text>
        <AppButton
          intent="danger"
          compact
          type="button"
          size="compact-xs"
          loading={unlinkInstructor.isPending}
          onClick={() => unlinkInstructor.mutate()}
        >
          解除
        </AppButton>
      </Group>
      {unlinkInstructor.isError && (
        <Text c="red" size="xs" px="sm" pt="xs">
          {unlinkInstructor.error.message}
        </Text>
      )}
    </>
  );
}
