import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';

/**
 * `/shifts` 配下の共通レイアウトルート。
 *
 * - 認証ガードをここで一度だけ実行し、子ルート（`/shifts`, `/shifts/manage` など）に継承する
 * - UI は `<Outlet />` のみで、ドメイン固有のレイアウトや Container は各子ルート側に持たせる
 */
export const Route = createFileRoute('/shifts')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(context.queryClient, location.pathname);
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: ShiftsLayout,
});

function ShiftsLayout() {
  return <Outlet />;
}
