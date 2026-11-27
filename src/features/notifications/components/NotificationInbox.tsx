import { Fragment, useId, useRef } from 'react';

import { Anchor, Box, Divider, Group, Paper, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import { AppBadge } from '@/components/AppBadge';

import { useNotificationSummary } from '../queries';
import { NotificationErrorAlert } from './NotificationErrorAlert';
import { NotificationItem } from './NotificationItem';

/** トップに置くお知らせの受信箱。未読の新しいものと未読総数を表示し、履歴へ案内する。 */
export function NotificationInbox() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data, isError, isFetching, refetch } = useNotificationSummary();

  const retry = () => {
    // 再試行ボタンは結果によって消えるため、先に見出しへ移す
    headingRef.current?.focus({ preventScroll: true });
    void refetch();
  };

  return (
    <Paper
      component="section"
      aria-labelledby={headingId}
      withBorder
      radius="md"
      style={{ overflow: 'hidden' }}
    >
      <Group justify="space-between" gap="xs" px="md" py="sm">
        <Group gap="xs">
          <Title order={2} size="h4" id={headingId} ref={headingRef} tabIndex={-1}>
            お知らせ
          </Title>
          {data && data.unreadCount > 0 && (
            <AppBadge kind="highlight">未読 {data.unreadCount}件</AppBadge>
          )}
        </Group>
        {data?.hasHistory && (
          <Anchor component={Link} to="/notifications" size="sm">
            すべて見る
          </Anchor>
        )}
      </Group>

      <Divider />

      {isError && (
        <Box px="md" py="sm">
          <NotificationErrorAlert
            message="お知らせを取得できませんでした"
            onRetry={retry}
            retrying={isFetching}
          />
        </Box>
      )}

      {!data && !isError && (
        <Text role="status" size="sm" c="dimmed" px="md" py="sm">
          お知らせを読み込み中
        </Text>
      )}

      {/* 取得に失敗している間は、古い結果を根拠に「ない」と表示しない */}
      {data && !isError && data.unreadCount === 0 && (
        <Text size="sm" c="dimmed" px="md" py="sm">
          {data.hasHistory ? '未読のお知らせはありません' : 'お知らせはありません'}
        </Text>
      )}

      {data?.items.map((notification, index) => (
        <Fragment key={notification.id}>
          {index > 0 && <Divider />}
          <NotificationItem notification={notification} focusAfterReadRef={headingRef} />
        </Fragment>
      ))}
    </Paper>
  );
}
