import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Navigate, Outlet, useLocation } from '@tanstack/react-router';

import { useMe } from '@/features/auth/queries';
import { getUnauthenticatedRedirect } from '@/features/auth/route-policy';

import { MemberInstructorLinkPrompt } from './MemberInstructorLinkPrompt';
import { MobileNavigation } from './MobileNavigation';
import { NavigationMenu } from './NavigationMenu';
import { UserMenu } from './UserMenu';

/** 認証状態に応じてログイン画面または認証済みアプリシェルを描画する。 */
export function RootLayout() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  const [desktopNavbarOpened, { toggle: toggleDesktopNavbar }] = useDisclosure(true);

  if (isLoading) {
    return <Outlet />;
  }
  if (!user) {
    const redirect = getUnauthenticatedRedirect(location.pathname);
    return redirect ? <Navigate {...redirect} /> : <Outlet />;
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
