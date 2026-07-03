import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { ShiftTypeList } from '@/features/shift-types/components/ShiftTypeList';

export const Route = createFileRoute('/shift-types')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/shift-types');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: ShiftTypesPage,
});

function ShiftTypesPage() {
  return (
    <Container size="sm" py="md">
      <ShiftTypeList />
    </Container>
  );
}
