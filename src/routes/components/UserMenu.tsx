import { Avatar, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

import { useLogout } from '@/features/auth/queries';
import type { MeResponse } from '@/features/auth/schema';

import { LinkedInstructorName } from './LinkedInstructorName';

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
        <Stack gap={0} px="sm" py="xs">
          <Text size="sm" fw={500} truncate>
            {user.displayName}
          </Text>
          <LinkedInstructorName instructorId={user.instructorId} />
        </Stack>
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
