import { Container, Group, Stack, ThemeIcon, Timeline, Title } from '@mantine/core';
import { IconCalendarEvent, IconChartBar, IconUsers } from '@tabler/icons-react';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { CurrentAttendance } from '@/features/dashboard/components/CurrentAttendance';
import { DashboardAvailabilityLink } from '@/features/dashboard/components/DashboardAvailabilityLink';
import { DashboardNotifications } from '@/features/dashboard/components/DashboardNotifications';
import { SeasonStatsSection } from '@/features/dashboard/components/SeasonStatsSection';
import { UpcomingShifts } from '@/features/dashboard/components/UpcomingShifts';
import { parseDate, todayString, WEEKDAY_LABELS } from '@/features/shifts/view-utils';

/**
 * ホーム（ルートパス）。通知と直近の勤務予定、シフト希望を表示する。
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
  const today = parseDate(todayString());
  const todayLabel = `${today.getUTCMonth() + 1}月${today.getUTCDate()}日（${WEEKDAY_LABELS[today.getUTCDay()]}）`;

  return (
    <Container size="sm" py="md">
      <Stack gap="xl">
        <Title order={1} size="h2">
          {todayLabel}
        </Title>

        <DashboardNotifications instructorId={instructorId ?? null} />

        {instructorId && (
          <>
            <Timeline active={0} bulletSize={32} lineWidth={2}>
              <Timeline.Item
                title={
                  <Title order={2} size="h3">
                    現在
                  </Title>
                }
                bullet={
                  <ThemeIcon size={32} radius="xl" variant="filled">
                    <IconUsers size={18} stroke={1.8} />
                  </ThemeIcon>
                }
              >
                <CurrentAttendance instructorId={instructorId} />
              </Timeline.Item>

              <Timeline.Item
                title={
                  <Title order={2} size="h3">
                    このあと
                  </Title>
                }
                bullet={
                  <ThemeIcon size={32} radius="xl" color="cyan" variant="light">
                    <IconCalendarEvent size={18} stroke={1.8} />
                  </ThemeIcon>
                }
              >
                <UpcomingShifts instructorId={instructorId} />
              </Timeline.Item>
            </Timeline>

            <DashboardAvailabilityLink />

            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon size={32} radius="xl" color="gray" variant="light">
                  <IconChartBar size={18} stroke={1.8} />
                </ThemeIcon>
                <Title order={2} size="h3">
                  今シーズン
                </Title>
              </Group>
              <SeasonStatsSection />
            </Stack>
          </>
        )}
      </Stack>
    </Container>
  );
}
