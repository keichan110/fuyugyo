import { Container } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';

import { ShiftAgendaViewer } from '@/features/shifts/components/ShiftAgendaViewer';
import { todayString } from '@/features/shifts/view-utils';

/** 表示ビューの検索パラメータ（共有可能な深いリンクの状態を URL に保持する） */
type ShiftsSearch = {
  /** アジェンダ起点日・主に閲覧中の日付（YYYY-MM-DD） */
  date: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/shifts/')({
  validateSearch: (search: Record<string, unknown>): ShiftsSearch => ({
    date:
      typeof search.date === 'string' && DATE_PATTERN.test(search.date)
        ? search.date
        : todayString(),
  }),
  component: ShiftsIndexPage,
});

function ShiftsIndexPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Container size="sm" py="md">
      <ShiftAgendaViewer
        date={search.date}
        onVisibleDateChange={(date) => {
          // 戻る操作の直後は、旧画面のObserverがアンマウント前に通知することがある。
          // 実際のURLを確認し、移動先の履歴を旧シフト表で上書きしない。
          if (!/^\/shifts\/?$/.test(window.location.pathname)) return;
          void navigate({ search: { date }, replace: true, resetScroll: false });
        }}
      />
    </Container>
  );
}
