import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
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
  return (
    <Container size="lg" py="md">
      <UserList />
    </Container>
  );
}
