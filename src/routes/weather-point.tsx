import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { WeatherPointSettings } from '@/features/weather';

export const Route = createFileRoute('/weather-point')({
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'ADMIN')) {
      throw redirect({ to: '/' });
    }
  },
  component: WeatherPointPage,
});

function WeatherPointPage() {
  return (
    <Container size="lg" py="md">
      <WeatherPointSettings />
    </Container>
  );
}
