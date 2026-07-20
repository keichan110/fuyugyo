import { Fragment, type ReactNode } from 'react';

import { ActionIcon, Box, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangleFilled, IconInfoCircle, IconX } from '@tabler/icons-react';

/** ダッシュボード通知の重要度。 */
export type DashboardNotificationLevel = 'info' | 'warn';

/** ダッシュボードの受信箱に表示する通知の内容。 */
export type DashboardNotification = {
  /** 通知の一意な識別子。 */
  id: string;
  /** 通知の重要度。 */
  level: DashboardNotificationLevel;
  /** 通知の件名。 */
  title: string;
  /** 通知の本文。 */
  description: string;
  /** 通知に対する主操作。 */
  action: ReactNode;
};

type DashboardNotificationInboxProps = {
  notifications: DashboardNotification[];
  onDismiss: (id: string) => void;
};

/** 通知の重要度に対応する表示色を返す。 */
function notificationColor(level: DashboardNotificationLevel) {
  return level === 'warn' ? 'yellow' : 'blue';
}

/**
 * ダッシュボード通知をメールの受信箱のように一覧表示する。
 * 通知の表示条件や操作は呼び出し側に委ね、新しい通知を追加しやすくする。
 */
export function DashboardNotificationInbox({
  notifications,
  onDismiss,
}: DashboardNotificationInboxProps) {
  if (notifications.length === 0) {
    return null;
  }

  const infoCount = notifications.filter((notification) => notification.level === 'info').length;
  const warnCount = notifications.filter((notification) => notification.level === 'warn').length;

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" px="md" py="sm">
        <Title order={2} size="h4">
          お知らせ
        </Title>
        <Group gap="xs">
          {infoCount > 0 && (
            <Group gap={4} c="blue.7" aria-label={`お知らせ${infoCount}件`}>
              <IconInfoCircle size={16} stroke={1.8} />
              <Text size="sm" fw={600}>
                {infoCount}
              </Text>
            </Group>
          )}
          {warnCount > 0 && (
            <Group gap={4} c="yellow.7" aria-label={`注意通知${warnCount}件`}>
              <IconAlertTriangleFilled size={16} />
              <Text size="sm" fw={600}>
                {warnCount}
              </Text>
            </Group>
          )}
        </Group>
      </Group>

      <Divider />

      <Stack gap={0}>
        {notifications.map((notification, index) => (
          <Fragment key={notification.id}>
            <Group align="flex-start" gap="sm" px="md" py="sm" wrap="nowrap">
              <Box mt={2} c={`${notificationColor(notification.level)}.7`}>
                {notification.level === 'warn' ? (
                  <IconAlertTriangleFilled size={20} />
                ) : (
                  <IconInfoCircle size={18} stroke={1.8} />
                )}
              </Box>
              <Stack gap={4} flex={1} miw={0}>
                <Text fw={600}>{notification.title}</Text>
                <Text size="sm" c="dimmed">
                  {notification.description}
                </Text>
                <Box mt={4}>{notification.action}</Box>
              </Stack>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`${notification.title}を閉じる`}
                onClick={() => onDismiss(notification.id)}
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
            {index < notifications.length - 1 && <Divider />}
          </Fragment>
        ))}
      </Stack>
    </Paper>
  );
}
