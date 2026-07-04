import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { ShiftManager } from '@/features/shifts/components/ShiftManager';

export const Route = createFileRoute('/shifts/manage')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/shifts/manage');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    if (!hasMinimumRole(result.user.role, 'MANAGER')) {
      throw redirect({ to: '/' });
    }
  },
  component: ShiftManagePage,
});

function ShiftManagePage() {
  return (
    <Container size="xl" py="md">
      <ShiftManager />
    </Container>
  );
}
