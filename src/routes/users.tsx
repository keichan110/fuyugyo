import { useState } from 'react';

import { Container, Tabs } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { AppBadge } from '@/components/AppBadge';
import { AccessRequestList } from '@/features/access-requests/components/AccessRequestList';
import { useAccessRequests } from '@/features/access-requests/queries';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { hasMinimumRole } from '@/features/auth/schema';
import { UserList } from '@/features/users/components/UserList';

export const Route = createFileRoute('/users')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    // MANAGER 以上のみアクセス可（MEMBER は / にリダイレクト）
    if (!hasMinimumRole(result.user.role, 'MANAGER')) {
      throw redirect({ to: '/' });
    }
  },
  component: UsersPage,
});

function UsersPage() {
  const { data: me } = useMe();
  const isAdmin = me ? hasMinimumRole(me.role, 'ADMIN') : false;
  const [tab, setTab] = useState<string | null>('users');
  // ナビの件数バッジと同じクエリ。ADMIN 以外は問い合わせない
  const { data: pending } = useAccessRequests(isAdmin);

  // MANAGER は既存の一覧のみ（タブ・承認待ちは表示しない）
  if (!isAdmin) {
    return (
      <Container size="lg" py="md">
        <UserList />
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="users">ユーザー</Tabs.Tab>
          <Tabs.Tab
            value="requests"
            rightSection={
              pending && pending.length > 0 ? (
                <AppBadge kind="pending" size="sm">
                  {pending.length}
                </AppBadge>
              ) : null
            }
          >
            承認待ち
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users">
          <UserList />
        </Tabs.Panel>
        <Tabs.Panel value="requests">
          <AccessRequestList />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
