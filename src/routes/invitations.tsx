import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { InvitationManager } from '@/features/invitations/components/InvitationManager';

export const Route = createFileRoute('/invitations')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/invitations');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    // ADMIN/MANAGER のみアクセス可（ホワイトリスト方式で将来のロール拡張に対応）
    if (result.user.role !== 'ADMIN' && result.user.role !== 'MANAGER') {
      throw redirect({ to: '/' });
    }
  },
  component: InvitationsPage,
});

function InvitationsPage() {
  return (
    <Container size="sm" py="md">
      <InvitationManager />
    </Container>
  );
}
