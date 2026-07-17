import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { ShiftTypeSettings } from '@/features/shift-types';

export const Route = createFileRoute('/shift-types')({
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'ADMIN')) {
      throw redirect({ to: '/' });
    }
  },
  component: ShiftTypesPage,
});

function ShiftTypesPage() {
  return (
    <Container size="lg" py="md">
      <ShiftTypeSettings />
    </Container>
  );
}
