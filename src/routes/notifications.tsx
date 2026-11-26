import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { NotificationHistory } from '@/features/notifications/components/NotificationHistory';

/** 本人宛てのお知らせの履歴（`/notifications`）。ログイン中の全ロールが利用する。 */
export const Route = createFileRoute('/notifications')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <Container size="sm" py="md">
      <NotificationHistory />
    </Container>
  );
}
