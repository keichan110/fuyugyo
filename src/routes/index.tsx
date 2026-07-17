import { Button, Card, Container, Group, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { UpcomingShifts } from '@/features/dashboard/components/UpcomingShifts';

/**
 * ダッシュボード（ルートパス）。直近の勤務予定、シフト希望、インストラクター連携を表示する。
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
  const instructorId = user?.instructorId;

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Title order={2}>ダッシュボード</Title>
        {instructorId && (
          <>
            <UpcomingShifts instructorId={instructorId} />
            <Card padding="lg">
              <Group justify="space-between" align="center">
                <Stack gap={4}>
                  <Title order={3} size="h4">
                    シフト希望
                  </Title>
                  <Text size="sm" c="dimmed">
                    勤務できない日や調整が必要な日を登録します。
                  </Text>
                </Stack>
                <Button component={Link} to="/availabilities" variant="outline">
                  シフト希望を入力
                </Button>
              </Group>
            </Card>
          </>
        )}
      </Stack>
    </Container>
  );
}
