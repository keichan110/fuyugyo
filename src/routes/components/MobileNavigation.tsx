import { AppShell, Divider, Drawer, Stack, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarCog,
  IconCalendarWeek,
  IconClipboardCheck,
  IconHome,
  IconLock,
  IconMenu2,
} from '@tabler/icons-react';
import { Link, useLocation } from '@tanstack/react-router';

import { hasMinimumRole, type MeResponse } from '@/features/auth/schema';

import { MobileAccountActions } from './MobileAccountActions';
import classes from './MobileNavigation.module.css';
import { NavigationMenu } from './NavigationMenu';
import { useMobileNavigationScroll } from './useMobileNavigationScroll';

const MEMBER_TABS = [
  { to: '/', label: 'ホーム', icon: IconHome },
  { to: '/shifts', label: 'シフト表', icon: IconCalendarWeek },
  { to: '/availabilities', label: 'シフト希望', icon: IconClipboardCheck },
];
const MANAGE_TAB = { to: '/shifts/manage', label: 'シフト管理', icon: IconCalendarCog };

/** モバイルの主要導線を固定タブに、残りのメニューとアカウント操作をドロワーに表示する。 */
export function MobileNavigation({ user }: { user: MeResponse }) {
  const [opened, { close, open }] = useDisclosure(false);
  const { pathname } = useLocation();
  const scrollHidden = useMobileNavigationScroll(
    !opened && (pathname === '/' || pathname === '/shifts' || pathname === '/shifts/'),
  );
  const tabs = hasMinimumRole(user.role, 'MANAGER') ? [...MEMBER_TABS, MANAGE_TAB] : MEMBER_TABS;
  // 詳細なパスを優先し、シフト管理中にシフト表まで選択状態になるのを防ぐ。
  const activePath = tabs
    .filter(({ to }) => pathname === to || (to !== '/' && pathname.startsWith(`${to}/`)))
    .sort((a, b) => b.to.length - a.to.length)
    .at(0)?.to;

  return (
    <>
      <AppShell.Footer
        hiddenFrom="sm"
        className={classes.footer}
        data-scroll-hidden={scrollHidden}
        inert={scrollHidden}
      >
        <nav className={classes.tabs} aria-label="メインナビゲーション">
          {tabs.map(({ to, label, icon: Icon }) => {
            const disabled = to === '/availabilities' && !user.instructorId;
            const contents = <Icon size={26} stroke={1.75} aria-hidden />;

            return disabled ? (
              <UnstyledButton
                key={to}
                className={classes.tab}
                disabled
                aria-label="シフト希望（管理者に紐付けを依頼してください）"
              >
                {contents}
                <IconLock size={12} stroke={2} className={classes.requireLink} aria-hidden />
              </UnstyledButton>
            ) : (
              <Link
                key={to}
                to={to}
                aria-label={label}
                title={label}
                search={{}}
                className={classes.tab}
                data-active={activePath === to || undefined}
                aria-current={activePath === to ? 'page' : undefined}
                activeOptions={{ exact: true, includeSearch: false }}
              >
                {contents}
              </Link>
            );
          })}
          <UnstyledButton
            className={classes.tab}
            onClick={open}
            aria-label="その他"
            title="その他"
            data-active={opened || !activePath || undefined}
            aria-expanded={opened}
            aria-controls="mobile-more-menu"
            aria-haspopup="dialog"
          >
            <IconMenu2 size={26} stroke={1.75} aria-hidden />
          </UnstyledButton>
        </nav>
      </AppShell.Footer>
      <Drawer
        id="mobile-more-menu"
        opened={opened}
        onClose={close}
        title="その他"
        position="bottom"
        size="auto"
        classNames={{ body: classes.moreMenuBody }}
        closeButtonProps={{ 'aria-label': 'メニューを閉じる' }}
      >
        <Stack gap="xs">
          <NavigationMenu user={user} onNavigate={close} excludedPaths={tabs.map(({ to }) => to)} />
          <Divider my="sm" />
          <MobileAccountActions user={user} />
        </Stack>
      </Drawer>
    </>
  );
}
