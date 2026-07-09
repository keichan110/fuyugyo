import { Container, Stack, Title } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { InstructorLinkPrompt } from '@/features/dashboard/components/InstructorLinkPrompt';
import { InstructorLinkStatus } from '@/features/dashboard/components/InstructorLinkStatus';
import { UpcomingShifts } from '@/features/dashboard/components/UpcomingShifts';

/**
 * ダッシュボード（ルートパス）。直近の勤務予定とインストラクター連携を表示する（#157）。
 */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data: user } = useMe();
  const linked = Boolean(user?.instructorId);

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Title order={2}>ダッシュボード</Title>
        {!linked && <InstructorLinkPrompt />}
        <UpcomingShifts />
        {linked && <InstructorLinkStatus />}
      </Stack>
    </Container>
  );
}
