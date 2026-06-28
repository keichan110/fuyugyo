import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAuthenticated } from '@/features/auth/auth-guard';
import { LoginPage } from '@/features/auth/components/LoginPage';

type LoginSearch = {
  redirect?: string | undefined;
  invite?: string | undefined;
  error?: string | undefined;
};

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    invite: typeof search.invite === 'string' ? search.invite : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  // 既にログイン済みならホームへ送る（未認証のみログイン UI を表示）
  beforeLoad: async ({ context, search }) => {
    if (await isAuthenticated(context.queryClient)) {
      throw redirect({ to: search.redirect ?? '/' });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  const search = Route.useSearch();
  return (
    <LoginPage
      error={search.error}
      inviteToken={search.invite}
      redirectUrl={search.redirect ?? '/'}
    />
  );
}
