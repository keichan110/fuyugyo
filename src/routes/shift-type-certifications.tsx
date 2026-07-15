import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { ShiftTypeCertificationSettings } from '@/features/department-shift-type-certifications/components/ShiftTypeCertificationSettings';

export const Route = createFileRoute('/shift-type-certifications')({
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'ADMIN')) {
      throw redirect({ to: '/' });
    }
  },
  component: ShiftTypeCertificationsPage,
});

function ShiftTypeCertificationsPage() {
  return (
    <Container size="lg" py="md">
      <ShiftTypeCertificationSettings />
    </Container>
  );
}
