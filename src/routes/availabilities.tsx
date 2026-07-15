import { Container, Stack, Title } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { AvailabilityCalendar } from '@/features/availabilities/components/AvailabilityCalendar';

/** 本人が勤務不可・回避希望日を月単位で申告するページ。 */
export const Route = createFileRoute('/availabilities')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/availabilities');
    if (!result.authenticated) throw redirect({ to: result.loginTo });
  },
  component: AvailabilitiesPage,
});

function AvailabilitiesPage() {
  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Title order={2}>勤務可否</Title>
        <AvailabilityCalendar />
      </Stack>
    </Container>
  );
}
