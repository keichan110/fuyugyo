import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { ShiftViewer, type ShiftViewMode } from '@/features/shifts/components/ShiftViewer';
import { todayString } from '@/features/shifts/view-utils';

/** 表示ビューの検索パラメータ（共有可能な深いリンクの状態を URL に保持する） */
type ShiftsSearch = {
  /** 表示モード（週次/月次） */
  view: ShiftViewMode;
  /** 基準日（YYYY-MM-DD） */
  date: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/shifts')({
  validateSearch: (search: Record<string, unknown>): ShiftsSearch => ({
    view: search.view === 'monthly' ? 'monthly' : 'weekly',
    date:
      typeof search.date === 'string' && DATE_PATTERN.test(search.date)
        ? search.date
        : todayString(),
  }),
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/shifts');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: ShiftsPage,
});

function ShiftsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Container size="sm" py="md">
      <ShiftViewer
        view={search.view}
        date={search.date}
        onChange={(next) => {
          void navigate({ search: next });
        }}
      />
    </Container>
  );
}
