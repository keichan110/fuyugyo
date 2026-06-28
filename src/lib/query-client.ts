import { QueryClient } from '@tanstack/react-query';

/** アプリ全体で共有する TanStack Query クライアント。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // マウント直後 30 秒はキャッシュを新鮮とみなし、不要な再フェッチを抑制する
      staleTime: 30_000,
      // ネットワーク障害時の連続リトライによる遅延を避けるため 1 回に制限する
      retry: 1,
    },
  },
});
