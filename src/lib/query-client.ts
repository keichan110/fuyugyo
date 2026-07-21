import { QueryClient } from '@tanstack/react-query';

/** マスタ系（管理者 mutation でのみ変化するデータ）向けの staleTime。時間ベース再取得を抑え、mutation の invalidate に古さの解消を委ねる。 */
export const MASTER_DATA_STALE_TIME = 5 * 60 * 1_000;

/** ユーザー固有かつ計算コストの高い season-stats 集計向けの staleTime / gcTime。『前日時点』の古さを許容し、セッション中の重い再計算を抑える。 */
export const SEASON_STATS_CACHE_TIME = 12 * 60 * 60 * 1_000;

/** アプリ全体で共有する TanStack Query クライアント。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // マウント直後 60 秒はキャッシュを新鮮とみなし、不要な再フェッチを抑制する
      staleTime: 60_000,
      // ネットワーク障害時の連続リトライによる遅延を避けるため 1 回に制限する
      retry: 1,
    },
  },
});
