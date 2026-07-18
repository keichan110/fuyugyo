import { Container, Group, Stack, Text, ThemeIcon, Timeline, Title } from '@mantine/core';
import { IconCalendarEvent, IconChartBar, IconUsers } from '@tabler/icons-react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { AppButton } from '@/components/AppButton';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { CurrentAttendance } from '@/features/dashboard/components/CurrentAttendance';
import { SeasonStatsSection } from '@/features/dashboard/components/SeasonStatsSection';
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
      <Stack gap="xl">
        <Title order={2}>ダッシュボード</Title>
        {instructorId && (
          <Timeline active={0} bulletSize={32} lineWidth={2}>
            <Timeline.Item
              title="現在"
              bullet={
                <ThemeIcon size={32} radius="xl" variant="filled">
                  <IconUsers size={18} stroke={1.8} />
                </ThemeIcon>
              }
            >
              <CurrentAttendance instructorId={instructorId} />
            </Timeline.Item>

            <Timeline.Item
              title="次の勤務"
              bullet={
                <ThemeIcon size={32} radius="xl" color="cyan" variant="light">
                  <IconCalendarEvent size={18} stroke={1.8} />
                </ThemeIcon>
              }
            >
              <UpcomingShifts instructorId={instructorId} />
            </Timeline.Item>

            <Timeline.Item
              title="今シーズン"
              bullet={
                <ThemeIcon size={32} radius="xl" color="gray" variant="light">
                  <IconChartBar size={18} stroke={1.8} />
                </ThemeIcon>
              }
            >
              <Stack gap="xl">
                <SeasonStatsSection />
                <Group justify="space-between" align="center">
                  <Stack gap={4}>
                    <Text fw={600}>シフト希望</Text>
                    <Text size="sm" c="dimmed">
                      勤務できない日や調整が必要な日を登録します。
                    </Text>
                  </Stack>
                  <AppButton intent="secondary" component={Link} to="/availabilities">
                    シフト希望を入力
                  </AppButton>
                </Group>
              </Stack>
            </Timeline.Item>
          </Timeline>
        )}
      </Stack>
    </Container>
  );
}
