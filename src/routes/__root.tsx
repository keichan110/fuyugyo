import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import { useMe } from '@/features/auth/queries';

import { MemberInstructorLinkPrompt } from './components/MemberInstructorLinkPrompt';
import { MobileNavigation } from './components/MobileNavigation';
import { NavigationMenu } from './components/NavigationMenu';
import { UserMenu } from './components/UserMenu';

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
