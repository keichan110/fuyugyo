import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';

import { RootLayout } from './components/RootLayout';

/** ルーターコンテキスト。ガードのデータ取得に QueryClient を共有する */
export type RouterContext = {
  queryClient: QueryClient;
};

/** ルートルート。レスポンシブなナビゲーションを持つ AppShell で全ページを包む */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
