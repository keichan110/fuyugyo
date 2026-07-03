import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { ShiftManager } from '@/features/shifts/components/ShiftManager';

export const Route = createFileRoute('/shifts/manage')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/shifts/manage');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: ShiftManagePage,
});

function ShiftManagePage() {
  return (
    <Container size="sm" py="md">
      <ShiftManager />
    </Container>
  );
}
