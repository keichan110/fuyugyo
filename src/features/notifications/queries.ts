import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { useMe } from '@/features/auth/queries';
import { client } from '@/lib/rpc';

import {
  notificationListResponseSchema,
  notificationReadResponseSchema,
  type Notification,
} from './schema';

/** お知らせ関連のクエリキー。 */
export const NOTIFICATIONS_QUERY_KEY: readonly string[] = ['notifications'];

/** トップに表示する未読のお知らせの上限。 */
const UNREAD_PREVIEW_LIMIT = 5;

/** 履歴で1回に読み込む件数。 */
const HISTORY_PAGE_SIZE = 20;

/** トップの受信箱に表示する内容。 */
export type NotificationSummary = {
  /** 未読のお知らせ（新しい順の先頭のみ） */
  items: Notification[];
  /** 本人の未読総数 */
  unreadCount: number;
  /** 既読を含め、お知らせが1件以上あるか */
  hasHistory: boolean;
};

/** 本人のお知らせを1ページ分取得する。 */
async function fetchNotificationPage(query: {
  limit: number;
  cursor?: string;
  unreadOnly?: boolean;
}) {
  const res = await client.api.notifications.me.$get({ query });
  if (!res.ok) {
    throw new Error('お知らせの取得に失敗しました');
  }
  return notificationListResponseSchema.parse(await res.json());
}

/**
 * トップ向けに、未読の先頭と未読総数を取得する。
 * 未読がないときは、全件を1件だけ取得して履歴の有無を確かめる。
 */
async function fetchNotificationSummary(): Promise<NotificationSummary> {
  const unread = await fetchNotificationPage({
    limit: UNREAD_PREVIEW_LIMIT,
    unreadOnly: true,
  });
  const hasHistory =
    unread.unreadCount > 0 || (await fetchNotificationPage({ limit: 1 })).items.length > 0;
  return { items: unread.items, unreadCount: unread.unreadCount, hasHistory };
}

/**
 * トップの受信箱の query 設定を認証主体ごとに返す。
 * @param userId - 現在ログイン中の User ID。未確定の間は取得しない
 */
export function notificationSummaryQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, userId ?? '', 'unread'],
    queryFn: fetchNotificationSummary,
    enabled: !!userId,
    // お知らせはサーバー側の操作で増えるため、再訪のたびに取り直す
    staleTime: 0,
  });
}

/**
 * 既読を含む履歴の query 設定を認証主体ごとに返す。次のページは API の cursor で続きから取得する。
 * @param userId - 現在ログイン中の User ID。未確定の間は取得しない
 */
export function notificationHistoryQueryOptions(userId: string | undefined) {
  return infiniteQueryOptions({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, userId ?? '', 'history'],
    queryFn: ({ pageParam }) =>
      fetchNotificationPage({
        limit: HISTORY_PAGE_SIZE,
        // 先頭ページは cursor を持たない
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
    // お知らせはサーバー側の操作で増えるため、再訪のたびに取り直す
    staleTime: 0,
  });
}

/**
 * お知らせを既読にする mutation 設定を返す。成功後はトップと履歴をまとめて取り直す。
 * @param queryClient - 再取得の対象を持つ QueryClient
 * @param onRead - サーバーで既読になった直後（再取得の前）に呼ぶ処理
 */
export function markNotificationReadMutationOptions(queryClient: QueryClient, onRead?: () => void) {
  return mutationOptions({
    mutationFn: async (id: string) => {
      const res = await client.api.notifications[':id'].read.$put({ param: { id } });
      if (!res.ok) {
        throw new Error('お知らせを既読にできませんでした');
      }
      return notificationReadResponseSchema.parse(await res.json());
    },
    onSuccess: async () => {
      onRead?.();
      // 既読化より前に始めた取得の結果で未読に戻らないよう、中断してから取り直す
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** 本人の未読のお知らせ（先頭と総数）を取得する。 */
export function useNotificationSummary() {
  const userId = useMe().data?.id;
  return useQuery(notificationSummaryQueryOptions(userId));
}

/** 本人のお知らせの履歴を、ページを追加しながら取得する。 */
export function useNotificationHistory() {
  const userId = useMe().data?.id;
  return useInfiniteQuery(notificationHistoryQueryOptions(userId));
}

/**
 * 本人のお知らせ1件を既読にする。
 * @param onRead - サーバーで既読になった直後（再取得の前）に呼ぶ処理
 */
export function useMarkNotificationRead(onRead?: () => void) {
  const queryClient = useQueryClient();
  return useMutation(markNotificationReadMutationOptions(queryClient, onRead));
}
