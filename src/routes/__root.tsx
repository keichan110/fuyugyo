import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

/** ルーターコンテキスト。ガードのデータ取得に QueryClient を共有する（ADR 0002） */
export type RouterContext = {
  queryClient: QueryClient;
};

/** ルートルート。`routes/` は配線のみで、ページ実体は `features/` に置く（ADR 0002）。 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
