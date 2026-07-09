import { AppShell, Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconCalendarCog, IconCalendarWeek, IconSettings, type Icon } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet, useNavigate } from '@tanstack/react-router';

import { useLogout, useMe } from '@/features/auth/queries';
import { hasMinimumRole, type MeResponse } from '@/features/auth/schema';

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
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Text
            component={Link}
            to="/"
            fw={700}
            size="lg"
            c="blue"
            style={{ textDecoration: 'none' }}
          >
            Fuyugyō
          </Text>
          <Group gap="xs" justify="center" style={{ flex: 1 }} wrap="nowrap">
            <HeaderLink to="/shifts" icon={IconCalendarWeek}>
              シフト表
            </HeaderLink>
            {hasMinimumRole(user.role, 'MANAGER') && (
              <HeaderLink to="/shifts/manage" icon={IconCalendarCog}>
                シフト管理
              </HeaderLink>
            )}
            {hasMinimumRole(user.role, 'MANAGER') && (
              <SettingsMenu isAdmin={user.role === 'ADMIN'} />
            )}
          </Group>
          <UserMenu user={user} />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/** ヘッダー中央のよく使う導線用リンク（設定メニューボタンと統一感のあるスタイル） */
function HeaderLink({ to, icon: Icon, children }: { to: string; icon: Icon; children: string }) {
  return (
    <Text
      component={Link}
      to={to}
      size="sm"
      fw={500}
      c="var(--mantine-color-text)"
      px="sm"
      py={4}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        textDecoration: 'none',
        borderRadius: 4,
      }}
    >
      <Icon size={16} stroke={1.75} />
      {children}
    </Text>
  );
}

/**
 * 設定ドロップダウンメニュー（ADR 0009: マスタ管理/ユーザー管理のグループ）。
 * シフト管理はヘッダー中央の独立導線へ移設済みのため、ここにはマスタ管理と
 * ユーザー管理のみを収める。マスタ管理は MANAGER 以上、ユーザー管理は ADMIN
 * のみに表示する（API 側の `requireRole` と揃える）。
 */
function SettingsMenu({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <UnstyledButton px="sm" py={4} style={{ borderRadius: 4 }}>
          <Group gap={6} wrap="nowrap">
            <IconSettings size={16} stroke={1.75} />
            <Text size="sm" fw={500}>
              設定
            </Text>
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
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

        {isAdmin && (
          <>
            <Menu.Divider />
            <Menu.Label>ユーザー管理</Menu.Label>
            <Menu.Item component={Link} to="/users">
              ユーザー
            </Menu.Item>
            <Menu.Item component={Link} to="/invitations">
              招待
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** アバター + ログアウトメニュー（全ユーザー共通） */
function UserMenu({ user }: { user: MeResponse }) {
  const logout = useLogout();
  const navigate = useNavigate();

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
