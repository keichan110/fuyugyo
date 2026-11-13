import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { CertificationList } from '@/features/certifications/components/CertificationList';

export const Route = createFileRoute('/certifications')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: CertificationsPage,
});

function CertificationsPage() {
  return (
    <Container size="lg" py="md">
      <CertificationList />
    </Container>
  );
}
