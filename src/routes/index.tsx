import { Container, Stack, ThemeIcon, Timeline, Title } from '@mantine/core';
import { IconCalendarEvent, IconChartBar, IconUsers } from '@tabler/icons-react';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { CurrentAttendance } from '@/features/dashboard/components/CurrentAttendance';
import { DashboardAvailabilityLink } from '@/features/dashboard/components/DashboardAvailabilityLink';
import { DashboardNotifications } from '@/features/dashboard/components/DashboardNotifications';
import { SeasonStatsSection } from '@/features/dashboard/components/SeasonStatsSection';
import { UpcomingShifts } from '@/features/dashboard/components/UpcomingShifts';

/**
 * ダッシュボード（ルートパス）。通知と直近の勤務予定、シフト希望を表示する。
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
        <DashboardNotifications instructorId={instructorId ?? null} />
        {instructorId && (
          <>
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
                <DashboardAvailabilityLink />
              </Timeline.Item>

              <Timeline.Item
                title="今シーズン"
                bullet={
                  <ThemeIcon size={32} radius="xl" color="gray" variant="light">
                    <IconChartBar size={18} stroke={1.8} />
                  </ThemeIcon>
                }
              >
                <SeasonStatsSection />
              </Timeline.Item>
            </Timeline>
          </>
        )}
      </Stack>
    </Container>
  );
}
