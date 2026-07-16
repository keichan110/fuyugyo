import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { CertificationRequirementSettings } from '@/features/certification-requirements/components/CertificationRequirementSettings';

export const Route = createFileRoute('/certification-requirements')({
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'ADMIN')) {
      throw redirect({ to: '/' });
    }
  },
  component: CertificationRequirementsPage,
});

function CertificationRequirementsPage() {
  return (
    <Container size="lg" py="md">
      <CertificationRequirementSettings />
    </Container>
  );
}
