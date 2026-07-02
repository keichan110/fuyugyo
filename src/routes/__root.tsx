import { AppShell, Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import { useLogout, useMe } from '@/features/auth/queries';
import type { MeResponse } from '@/features/auth/schema';

/** ルーターコンテキスト。ガードのデータ取得に QueryClient を共有する（ADR 0002） */
export type RouterContext = {
  queryClient: QueryClient;
};

/** ルートルート。ヘッダーのみの AppShell で全ページを包む（ADR 0009） */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { data: user, isLoading } = useMe();

  // 未認証（ログイン画面等）は AppShell なしで素通しする
  if (isLoading || !user) {
    return <Outlet />;
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text
            component={Link}
            to="/shifts"
            fw={700}
            size="lg"
            c="blue"
            style={{ textDecoration: 'none' }}
          >
            Fuyugyō
          </Text>
          <Group gap="sm">
            {user.role === 'ADMIN' && <AdminMenu />}
            <UserMenu user={user} />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/** 管理者向けナビゲーションメニュー（ADR 0009: シフト運用/マスタ管理/ユーザー管理の3グループ） */
function AdminMenu() {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <UnstyledButton px="sm" py={4} style={{ borderRadius: 4 }}>
          <Text size="sm" fw={500}>
            管理
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>シフト運用</Menu.Label>
        <Menu.Item component={Link} to="/shifts/manage">
          シフト管理
        </Menu.Item>

        <Menu.Divider />
        <Menu.Label>マスタ管理</Menu.Label>
        <Menu.Item component={Link} to="/departments">
          部門
        </Menu.Item>
        <Menu.Item component={Link} to="/certifications">
          資格
        </Menu.Item>
        <Menu.Item component={Link} to="/shift-types">
          シフト種別
        </Menu.Item>
        <Menu.Item component={Link} to="/instructors">
          インストラクター
        </Menu.Item>

        <Menu.Divider />
        <Menu.Label>ユーザー管理</Menu.Label>
        <Menu.Item component={Link} to="/users">
          ユーザー
        </Menu.Item>
        <Menu.Item component={Link} to="/invitations">
          招待
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** アバター + ログアウトメニュー（全ユーザー共通） */
function UserMenu({ user }: { user: MeResponse }) {
  const logout = useLogout();

  return (
    <Menu shadow="md" width={180} position="bottom-end">
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
        <Menu.Divider />
        <Menu.Item onClick={() => logout.mutate()}>ログアウト</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
