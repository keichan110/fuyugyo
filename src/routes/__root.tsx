import {
  AppShell,
  Avatar,
  Button,
  Container,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconCalendarCog, IconCalendarWeek, IconSettings, type Icon } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';

import { useLogout, useMe, useUnlinkInstructor } from '@/features/auth/queries';
import { hasMinimumRole, type MeResponse } from '@/features/auth/schema';
import { InstructorLinkPrompt } from '@/features/dashboard/components/InstructorLinkPrompt';
import { useInstructor } from '@/features/instructors/queries';

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
          <Text component={Link} to="/" fw={700} size="lg" c="blue" td="none">
            Fuyugyō
          </Text>
          <Group gap="xs" justify="center" flex={1} wrap="nowrap">
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
        <MemberInstructorLinkPrompt user={user} />
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/** MEMBER 向け画面の共通位置に、未連携時のインストラクター連携案内を表示する。 */
function MemberInstructorLinkPrompt({ user }: { user: MeResponse }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (user.instructorId || !MEMBER_PATHS.has(pathname)) {
    return null;
  }

  return (
    <Container size="sm" pt="md">
      <InstructorLinkPrompt />
    </Container>
  );
}

const MEMBER_PATHS = new Set(['/', '/shifts']);

/** ヘッダー中央のよく使う導線用リンク（設定メニューボタンと統一感のあるスタイル） */
function HeaderLink({ to, icon: Icon, children }: { to: string; icon: Icon; children: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pathname === to;

  return (
    <Button
      component={Link}
      to={to}
      variant={active ? 'light' : 'subtle'}
      color={active ? 'blue' : 'gray'}
      size="sm"
      leftSection={<Icon size={16} stroke={1.75} />}
      px="sm"
    >
      {children}
    </Button>
  );
}

/**
 * 設定ドロップダウンメニュー（ADR 0009: マスタ管理/ユーザー管理のグループ）。
 * シフト管理はヘッダー中央の独立導線へ移設済みのため、ここにはマスタ管理と
 * ユーザー管理のみを収める。マスタ管理は MANAGER 以上、ユーザー管理は ADMIN
 * のみに表示する（API 側の `requireRole` と揃える）。
 */
function SettingsMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = SETTINGS_PATHS.has(pathname);

  return (
    <Menu width={200}>
      <Menu.Target>
        <Button
          variant={active ? 'light' : 'subtle'}
          color={active ? 'blue' : 'gray'}
          size="sm"
          leftSection={<IconSettings size={16} stroke={1.75} />}
          px="sm"
        >
          設定
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>マスタ管理</Menu.Label>
        <Menu.Item component={Link} to="/certifications">
          資格
        </Menu.Item>
        {isAdmin && (
          <Menu.Item component={Link} to="/shift-types">
            シフト種別設定
          </Menu.Item>
        )}
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

const SETTINGS_PATHS = new Set([
  '/certifications',
  '/shift-types',
  '/instructors',
  '/users',
  '/invitations',
]);

/** アバター + ログアウトメニュー（全ユーザー共通） */
function UserMenu({ user }: { user: MeResponse }) {
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
        <Button
          type="button"
          variant="subtle"
          color="red"
          size="compact-xs"
          loading={unlinkInstructor.isPending}
          onClick={() => unlinkInstructor.mutate()}
        >
          解除
        </Button>
      </Group>
      {unlinkInstructor.isError && (
        <Text c="red" size="xs" px="sm" pt="xs">
          {unlinkInstructor.error.message}
        </Text>
      )}
    </>
  );
}
