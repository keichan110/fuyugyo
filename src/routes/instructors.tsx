import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { InstructorList } from '@/features/instructors/components/InstructorList';

export const Route = createFileRoute('/instructors')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/instructors');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: InstructorsPage,
});

function InstructorsPage() {
  return (
    <Container size="lg" py="md">
      <InstructorList />
    </Container>
  );
}
