import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { todayString } from '@/features/shifts/view-utils';

/**
 * ルートパス。ダッシュボード実装（Phase 2）までの暫定措置として `/shifts` へリダイレクトする（#157）。
 */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    throw redirect({ to: '/shifts', search: { view: 'weekly', date: todayString() } });
  },
});
