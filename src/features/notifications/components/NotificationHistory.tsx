import { Fragment, useRef, useState } from 'react';

import { Divider, Paper, Stack, Text, Title } from '@mantine/core';

import { AppButton } from '@/components/AppButton';

import { useNotificationHistory } from '../queries';
import { NotificationErrorAlert } from './NotificationErrorAlert';
import { NotificationItem } from './NotificationItem';

/** 既読を含む本人のお知らせを新しい順に表示し、続きを追加で読み込む。 */
export function NotificationHistory() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** 利用者が追加読み込みを依頼したページの番号 */
  const [requestedPageIndex, setRequestedPageIndex] = useState<number | null>(null);
  const {
    data,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useNotificationHistory();
  const pages = data?.pages ?? [];
  // 取り直しでお知らせが隣のページへ移っても行の状態を保てるよう、1つの並びにまとめる
  const rows = pages.flatMap((page, pageIndex) =>
    page.items.map((notification, itemIndex) => ({
      notification,
      startsRequestedPage: pageIndex === requestedPageIndex && itemIndex === 0,
    })),
  );
  // 続きの取得の失敗は取得済みの行の下に表示し、一覧全体の失敗とは分ける。
  // その失敗の後に取り直している間は両者を区別できないため、一覧全体の失敗として扱わない
  const isListError = isError && !isFetchNextPageError && !(isFetching && hasNextPage);

  const loadMore = () => {
    setRequestedPageIndex(pages.length);
    void fetchNextPage();
  };

  const retry = () => {
    // 再試行ボタンは結果によって消えるため、先に見出しへ移す
    headingRef.current?.focus({ preventScroll: true });
    void refetch();
  };

  return (
    <Stack gap="md">
      <Title order={2} ref={headingRef} tabIndex={-1}>
        お知らせ
      </Title>

      {isListError && (
        <NotificationErrorAlert
          message="お知らせを取得できませんでした"
          onRetry={retry}
          retrying={isFetching}
        />
      )}

      {!data && !isError && (
        <Text role="status" size="sm" c="dimmed">
          お知らせを読み込み中
        </Text>
      )}

      {/* 取得に失敗している間は、古い結果を根拠に「ない」と表示しない */}
      {data && !isError && rows.length === 0 && (
        <Text size="sm" c="dimmed">
          お知らせはありません
        </Text>
      )}

      {rows.length > 0 && (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          {rows.map(({ notification, startsRequestedPage }, index) => (
            <Fragment key={notification.id}>
              {index > 0 && <Divider />}
              <NotificationItem notification={notification} focusOnMount={startsRequestedPage} />
            </Fragment>
          ))}
        </Paper>
      )}

      {isFetchNextPageError ? (
        <NotificationErrorAlert
          message="続きのお知らせを取得できませんでした"
          onRetry={loadMore}
          retrying={isFetching}
          restoreFocus
        />
      ) : hasNextPage ? (
        <AppButton
          intent="secondary"
          loading={isFetchingNextPage}
          // 再取得中に押すと再取得が中断され、古いページが残るため待たせる
          disabled={isFetching}
          onClick={loadMore}
        >
          もっと見る
        </AppButton>
      ) : null}
    </Stack>
  );
}
