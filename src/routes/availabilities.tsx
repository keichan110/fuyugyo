import { Container, Stack, Title } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { AvailabilityCalendar } from '@/features/availabilities/components/AvailabilityCalendar';
import { todayString } from '@/features/shifts/view-utils';

/** シフト希望ページの検索パラメータ。 */
type AvailabilitiesSearch = {
  /** 初期表示する月（YYYY-MM） */
  month: string;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 本人が勤務不可・回避希望日を月単位で申告するページ。 */
export const Route = createFileRoute('/availabilities')({
  validateSearch: (search: Record<string, unknown>): AvailabilitiesSearch => ({
    month:
      typeof search.month === 'string' && MONTH_PATTERN.test(search.month)
        ? search.month
        : todayString().slice(0, 7),
  }),
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/availabilities');
    if (!result.authenticated) throw redirect({ to: result.loginTo });
  },
  component: AvailabilitiesPage,
});

function AvailabilitiesPage() {
  const search = Route.useSearch();

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Title order={2}>シフト希望</Title>
        <AvailabilityCalendar initialMonth={search.month} />
      </Stack>
    </Container>
  );
}
