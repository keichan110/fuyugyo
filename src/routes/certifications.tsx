import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { CertificationList } from '@/features/certifications/components/CertificationList';

export const Route = createFileRoute('/certifications')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/certifications');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: CertificationsPage,
});

function CertificationsPage() {
  return (
    <Container size="sm" py="md">
      <CertificationList />
    </Container>
  );
}
