import { Avatar, Group, Stack, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

import { AppButton } from '@/components/AppButton';
import { useLogout } from '@/features/auth/queries';
import type { MeResponse } from '@/features/auth/schema';

import { LinkedInstructorName } from './LinkedInstructorName';

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
        <Stack gap={0} miw={0}>
          <Text size="sm" truncate>
            {user.displayName}
          </Text>
          <LinkedInstructorName instructorId={user.instructorId} />
        </Stack>
      </Group>
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
