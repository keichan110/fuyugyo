import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Navigate, Outlet, useLocation } from '@tanstack/react-router';

import { useMe } from '@/features/auth/queries';
import { getUnauthenticatedRedirect } from '@/features/auth/route-policy';

import { MobileNavigation } from './MobileNavigation';
import { NavigationMenu } from './NavigationMenu';
import { useMobileKeyboardOpen } from './useMobileKeyboardOpen';
import { UserMenu } from './UserMenu';

const MOBILE_NAVIGATION_HEIGHT = 48;

/** 認証状態に応じてログイン画面または認証済みアプリシェルを描画する。 */
export function RootLayout() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  const mobileKeyboardOpened = useMobileKeyboardOpen();
  const [desktopNavbarOpened, { toggle: toggleDesktopNavbar }] = useDisclosure(true);

  if (isLoading) {
    return <Outlet />;
  }
  if (!user) {
    const redirect = getUnauthenticatedRedirect(
      location.pathname,
      location.pathname + location.searchStr,
    );
    return redirect ? <Navigate {...redirect} /> : <Outlet />;
  }

  return (
    <AppShell
      style={{ '--mobile-navigation-height': `${MOBILE_NAVIGATION_HEIGHT}px` }}
      data-mobile-keyboard-open={mobileKeyboardOpened || undefined}
      header={{ height: { base: 0, sm: 60 } }}
      footer={{
        height: {
          base: `calc(${MOBILE_NAVIGATION_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          sm: 0,
        },
        collapsed: mobileKeyboardOpened,
      }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: true, desktop: !desktopNavbarOpened },
      }}
      padding="md"
    >
      <AppShell.Header visibleFrom="sm">
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
      <MobileNavigation key={location.pathname} user={user} />
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
