import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { UserList } from '@/features/users/components/UserList';

export const Route = createFileRoute('/users')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/users');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    // ADMIN のみアクセス可（ADMIN 以外は / にリダイレクト）
    if (result.user.role !== 'ADMIN') {
      throw redirect({ to: '/' });
    }
  },
  component: UsersPage,
});

function UsersPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <UserList />
    </main>
  );
}
