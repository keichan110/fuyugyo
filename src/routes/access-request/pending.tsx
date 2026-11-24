import { createFileRoute, redirect } from '@tanstack/react-router';

import { AccessRequestPendingPage } from '@/features/access-requests/components/AccessRequestPendingPage';
import { fetchMe } from '@/features/auth/auth-guard';

export const Route = createFileRoute('/access-request/pending')({
  // 認証済みの人は申請不要のためトップへ送る
  beforeLoad: async ({ context }) => {
    if (await fetchMe(context.queryClient)) throw redirect({ to: '/' });
  },
  component: AccessRequestPendingPage,
});
