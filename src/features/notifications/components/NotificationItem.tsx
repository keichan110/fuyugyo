import { useEffect, useId, useRef, type RefObject } from 'react';

import { Anchor, Box, Group, Stack, Text, Title } from '@mantine/core';

import { AppButton } from '@/components/AppButton';
import { formatDateTimeJst } from '@/features/invitations/lib';

import { useMarkNotificationRead } from '../queries';
import type { Notification } from '../schema';
import { moveFocusIfLost } from './move-focus';
import { NotificationErrorAlert } from './NotificationErrorAlert';

type NotificationItemProps = {
  /** 表示するお知らせ */
  notification: Notification;
  /** 既読にした後のフォーカス移動先。行が一覧から消える場合に指定し、省略時はこの行へ移す */
  focusAfterReadRef?: RefObject<HTMLElement | null>;
  /** 追加読み込みで現れた先頭の行として、フォーカスを受け取るかどうか */
  focusOnMount?: boolean;
};

/**
 * トップと履歴で共有するお知らせ1件の行。
 * 既読にするのは「既読にする」を操作したときだけで、表示や関連画面への移動では既読にしない。
 */
export function NotificationItem({
  notification,
  focusAfterReadRef,
  focusOnMount = false,
}: NotificationItemProps) {
  const titleId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const markRead = useMarkNotificationRead(() => {
    // 「既読にする」ボタンはこの後に消えるため、移動先を確保しておく
    moveFocusIfLost(focusAfterReadRef?.current ?? rowRef.current, rowRef.current);
  });
  const unread = notification.readAt === null;
  const showReadButton = unread && !markRead.isError;

  useEffect(() => {
    if (focusOnMount) {
      moveFocusIfLost(rowRef.current);
    }
  }, [focusOnMount]);

  const markAsRead = () => markRead.mutate(notification.id);

  return (
    <Box component="article" ref={rowRef} aria-labelledby={titleId} tabIndex={-1} px="md" py="sm">
      <Stack gap={4}>
        <Title order={3} size="h5" id={titleId} style={{ overflowWrap: 'anywhere' }}>
          {notification.title}
        </Title>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {notification.body}
        </Text>
        <Text size="xs" c="dimmed">
          <time dateTime={notification.createdAt}>
            {formatDateTimeJst(new Date(notification.createdAt))}
          </time>
          {' · '}
          {unread ? '未読' : '既読'}
        </Text>

        {(notification.actionUrl || showReadButton) && (
          <Group gap="md" mt={4}>
            {notification.actionUrl && (
              <Anchor href={notification.actionUrl} size="sm" aria-describedby={titleId}>
                関連画面を開く
              </Anchor>
            )}
            {showReadButton && (
              <AppButton
                intent="secondary"
                size="xs"
                loading={markRead.isPending}
                onClick={markAsRead}
                aria-describedby={titleId}
              >
                既読にする
              </AppButton>
            )}
          </Group>
        )}

        {unread && markRead.isError && (
          <NotificationErrorAlert
            message="既読にできませんでした"
            onRetry={markAsRead}
            retrying={markRead.isPending}
            restoreFocus
          />
        )}
      </Stack>
    </Box>
  );
}
