import { createFileRoute } from '@tanstack/react-router';

import { guardLoginPage } from '@/features/auth/auth-guard';
import { LoginPage } from '@/features/auth/components/LoginPage';
import type { LoginSearch } from '@/features/auth/login-policy';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    invite: typeof search.invite === 'string' ? search.invite : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  beforeLoad: ({ context, search }) =>
    guardLoginPage(
      context.queryClient,
      search,
      typeof window === 'undefined' ? '' : window.navigator.userAgent,
    ),
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
