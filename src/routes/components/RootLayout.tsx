import { AppShell, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Navigate, Outlet, useLocation } from '@tanstack/react-router';

import { useMe } from '@/features/auth/queries';
import { getUnauthenticatedRedirect } from '@/features/auth/route-policy';
import { NotificationHeaderLink } from '@/features/notifications/components/NotificationHeaderLink';

import { AppLogo } from './AppLogo';
import { MobileNavigation } from './MobileNavigation';
import { NavigationMenu } from './NavigationMenu';
import classes from './RootLayout.module.css';
import { useMobileKeyboardOpen } from './useMobileKeyboardOpen';
import { UserMenu } from './UserMenu';

const MOBILE_NAVIGATION_HEIGHT = 48;
const MOBILE_HEADER_HEIGHT = 44;
const DESKTOP_HEADER_HEIGHT = 60;

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
      header={{ height: { base: MOBILE_HEADER_HEIGHT, sm: DESKTOP_HEADER_HEIGHT } }}
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
      <AppShell.Header className={classes.header}>
        <Group h="100%" px={{ base: 'xs', sm: 'md' }} justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              visibleFrom="sm"
              opened={desktopNavbarOpened}
              onClick={toggleDesktopNavbar}
              aria-label={desktopNavbarOpened ? 'サイドバーを閉じる' : 'サイドバーを開く'}
              size="sm"
              color="var(--app-color-warm-white)"
            />
            <AppLogo />
          </Group>
          <Group gap="xs" wrap="nowrap">
            <NotificationHeaderLink />
            <Group visibleFrom="sm" gap={0} wrap="nowrap">
              <UserMenu user={user} />
            </Group>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar className={classes.navbar} p="sm">
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
