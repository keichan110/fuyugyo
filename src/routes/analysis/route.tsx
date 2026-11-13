import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';

/**
 * `/analysis` 配下の共通レイアウトルート。
 *
 * - 認証ガードをここで一度だけ実行し、子ルート（`/analysis/season` など）に継承する
 * - UI は `<Outlet />` のみで、レイアウトや Container は各子ルート側に持たせる
 */
export const Route = createFileRoute('/analysis')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: AnalysisLayout,
});

function AnalysisLayout() {
  return <Outlet />;
}
