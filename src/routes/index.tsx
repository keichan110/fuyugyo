import { Container, Stack, Title, VisuallyHidden } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { useMe } from '@/features/auth/queries';
import { PersonalSchedule } from '@/features/dashboard/components/PersonalSchedule';
import { SeasonStatsSection } from '@/features/dashboard/components/SeasonStatsSection';
import { TeamSchedule } from '@/features/dashboard/components/TeamSchedule';
import { NotificationInbox } from '@/features/notifications/components/NotificationInbox';
import { scheduleToday } from '@/lib/schedule-date-range';

/**
 * ホーム（ルートパス）。お知らせの受信箱と全体の予定を表示し、インストラクター連携済みなら
 * 個人の予定・今シーズンの統計も表示する。
 */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data: user } = useMe();
  const instructorId = user?.instructorId;
  // 全体と個人の予定は、学校（日本時間）の当日を共通の基準にする
  const today = scheduleToday();

  return (
    <Container size="sm" py="md">
      {/* 画面はお知らせから始め、ページ見出しは読み上げ用に残す。Stack の余白を増やさないよう外に置く */}
      <VisuallyHidden>
        <Title order={1}>ホーム</Title>
      </VisuallyHidden>

      <Stack gap="xl">
        <NotificationInbox />

        {/* 全出勤者の表示で本人データではないため、未連携でも表示する */}
        <TeamSchedule instructorId={instructorId ?? null} today={today} />

        {/* 以降は本人のデータのため、紐付けが前提 */}
        {instructorId && (
          <>
            <PersonalSchedule instructorId={instructorId} today={today} />
            <SeasonStatsSection />
          </>
        )}
      </Stack>
    </Container>
  );
}
