import {
  AppShell,
  Avatar,
  Burger,
  Button,
  Container,
  Divider,
  Drawer,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarCog,
  IconCalendarWeek,
  IconCertificate,
  IconHome,
  IconSettings,
  IconTicket,
  IconUser,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
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

/** ルートルート。レスポンシブなナビゲーションを持つ AppShell で全ページを包む（ADR 0009） */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { data: user, isLoading } = useMe();
  const [desktopNavbarOpened, { toggle: toggleDesktopNavbar }] = useDisclosure(true);

  // 未認証（ログイン画面等）は AppShell なしで素通しする
  if (isLoading || !user) {
    return <Outlet />;
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: true, desktop: !desktopNavbarOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px={{ base: 'xs', sm: 'md' }} justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              visibleFrom="sm"
              opened={desktopNavbarOpened}
              onClick={toggleDesktopNavbar}
              aria-label={desktopNavbarOpened ? 'サイドバーを閉じる' : 'サイドバーを開く'}
              size="sm"
            />
            <Text component={Link} to="/" fw={700} size="lg" c="blue" td="none">
              Fuyugyō
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <MobileNavigation user={user} />
            <Group visibleFrom="sm" gap={0} wrap="nowrap">
              <UserMenu user={user} />
            </Group>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <NavigationMenu user={user} />
        </AppShell.Section>
      </AppShell.Navbar>
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
const NOOP = () => {};

type NavigationItem = {
  to: string;
  label: string;
  icon: Icon;
  minimumRole?: MeResponse['role'];
};

type NavigationGroup = {
  id: string;
  label?: string;
  items: NavigationItem[];
};

const NAVIGATION_GROUPS: NavigationGroup[] = [
  { id: 'dashboard', items: [{ to: '/', label: 'ダッシュボード', icon: IconHome }] },
  {
    id: 'shift-operations',
    label: 'シフト運用',
    items: [
      { to: '/shifts', label: 'シフト表', icon: IconCalendarWeek },
      { to: '/shifts/manage', label: 'シフト管理', icon: IconCalendarCog, minimumRole: 'MANAGER' },
    ],
  },
  {
    id: 'master-data',
    label: 'マスタ管理',
    items: [
      { to: '/certifications', label: '資格', icon: IconCertificate, minimumRole: 'MANAGER' },
      { to: '/shift-types', label: 'シフト種別設定', icon: IconSettings, minimumRole: 'ADMIN' },
      { to: '/instructors', label: 'インストラクター', icon: IconUser, minimumRole: 'MANAGER' },
    ],
  },
  {
    id: 'user-management',
    label: 'ユーザー管理',
    items: [
      { to: '/users', label: 'ユーザー', icon: IconUsers, minimumRole: 'ADMIN' },
      { to: '/invitations', label: '招待', icon: IconTicket, minimumRole: 'ADMIN' },
    ],
  },
];

/** ロールに応じた共通ナビゲーション。サイドバーとモバイルドロワーで共有する。 */
function NavigationMenu({
  user,
  onNavigate = NOOP,
}: {
  user: MeResponse;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigationGroups = NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.minimumRole || hasMinimumRole(user.role, item.minimumRole),
    ),
  }));
  // 現在地に一致する項目のうち、最も深いパスだけをアクティブにする
  const activePath = navigationGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)
    .at(0)?.to;

  return (
    <Stack gap="sm">
      {navigationGroups.map((group) => {
        if (group.items.length === 0) {
          return null;
        }

        return (
          <Stack key={group.id} gap={4}>
            {group.label && (
              <Text size="xs" fw={700} c="dimmed" px="sm" mt="xs">
                {group.label}
              </Text>
            )}
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                component={Link}
                to={to}
                activeOptions={{ exact: true }}
                label={label}
                leftSection={<Icon size={18} stroke={1.75} />}
                active={activePath === to}
                variant="light"
                onClick={onNavigate}
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}

/** モバイル幅でヘッダー導線をまとめるドロワーナビゲーション。 */
function MobileNavigation({ user }: { user: MeResponse }) {
  const [opened, { close, toggle }] = useDisclosure(false);

  return (
    <>
      <Burger
        hiddenFrom="sm"
        opened={opened}
        onClick={toggle}
        aria-label={opened ? 'ナビゲーションを閉じる' : 'ナビゲーションを開く'}
        size="sm"
      />
      <Drawer opened={opened} onClose={close} title="メニュー">
        <Stack gap="xs">
          <NavigationMenu user={user} onNavigate={close} />
          <Divider my="sm" />
          <MobileAccountActions user={user} />
        </Stack>
      </Drawer>
    </>
  );
}

/** モバイル用ドロワー内のアカウント操作。入れ子のメニューにせず直接操作できるようにする。 */
function MobileAccountActions({ user }: { user: MeResponse }) {
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
      <Button
        color="red"
        variant="subtle"
        justify="flex-start"
        loading={logout.isPending}
        onClick={() => {
          // ログアウト後は保護ルート上に取り残されないようルートへ遷移する
          logout.mutate(undefined, { onSuccess: () => void navigate({ to: '/' }) });
        }}
      >
        ログアウト
      </Button>
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
        <Button
          type="button"
          variant="subtle"
          color="red"
          size="compact-xs"
          loading={unlinkInstructor.isPending}
          onClick={() => unlinkInstructor.mutate()}
        >
          連携解除
        </Button>
      </Group>
      {unlinkInstructor.isError && (
        <Text c="red" size="xs">
          {unlinkInstructor.error.message}
        </Text>
      )}
    </Stack>
  );
}

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
