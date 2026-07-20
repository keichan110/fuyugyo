import { Avatar, Group, Stack, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

import { AppButton } from '@/components/AppButton';
import { useLogout, useUnlinkInstructor } from '@/features/auth/queries';
import type { MeResponse } from '@/features/auth/schema';
import { useInstructor } from '@/features/instructors/queries';

/** モバイル用ドロワー内のアカウント操作。入れ子のメニューにせず直接操作できるようにする。 */
export function MobileAccountActions({ user }: { user: MeResponse }) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <Stack gap="xs">
      <Text size="sm" fw={700}>
        アカウント
      </Text>
      <Group gap="sm" wrap="nowrap">
        <Avatar
          src={user.pictureUrl}
          name={user.displayName}
          color="initials"
          radius="xl"
          size="md"
        />
        <Text size="sm" truncate>
          {user.displayName}
        </Text>
      </Group>
      {user.instructorId && (
        <>
          <Text size="sm" fw={700} mt="xs">
            インストラクター連携
          </Text>
          <MobileInstructorLinkSection instructorId={user.instructorId} />
        </>
      )}
      <AppButton
        intent="tertiary"
        justify="flex-start"
        loading={logout.isPending}
        onClick={() => {
          // ログアウト後は保護ルート上に取り残されないようルートへ遷移する
          logout.mutate(undefined, { onSuccess: () => void navigate({ to: '/' }) });
        }}
      >
        ログアウト
      </AppButton>
    </Stack>
  );
}

/** モバイル用ドロワー内でインストラクター連携を表示・解除する。 */
function MobileInstructorLinkSection({ instructorId }: { instructorId: string }) {
  const { data: instructor } = useInstructor(instructorId);
  const unlinkInstructor = useUnlinkInstructor();

  return (
    <Stack gap={0}>
      <Group gap="xs" wrap="nowrap">
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
          連携解除
        </AppButton>
      </Group>
      {unlinkInstructor.isError && (
        <Text c="red" size="xs">
          {unlinkInstructor.error.message}
        </Text>
      )}
    </Stack>
  );
}
