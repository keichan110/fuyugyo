import { NavLink, Stack, Text } from '@mantine/core';
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
import { Link, useRouterState } from '@tanstack/react-router';

import { hasMinimumRole, type MeResponse } from '@/features/auth/schema';

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
  { id: 'dashboard', items: [{ to: '/', label: 'ホーム', icon: IconHome }] },
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
export function NavigationMenu({
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
  const matchingNavigationItems: NavigationItem[] = [];
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        matchingNavigationItems.push(item);
      }
    }
  }
  const activePath = matchingNavigationItems.sort((a, b) => b.to.length - a.to.length).at(0)?.to;

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
