import {
  Badge,
  Button,
  CopyButton,
  Group,
  Paper,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBan, IconCheck, IconClock, IconCopy, IconUsers } from '@tabler/icons-react';

import { buildInviteUrl, formatDateTime, remainingLabel } from '../lib';
import { useDeactivateInvitation } from '../queries';
import type { Invitation } from '../schema';

/** 残り時間の強調表示を切り替える閾値（時間） */
const EXPIRY_WARNING_HOURS = 24;

type ActiveInvitationCardProps = {
  invitation: Invitation;
};

/**
 * 現在有効な招待リンクを表示するヒーローカード。
 * リンクのワンアクションコピーと、Popoverでの軽い確認を挟んだ即時停止を提供する。
 */
export function ActiveInvitationCard({ invitation }: ActiveInvitationCardProps) {
  const deactivate = useDeactivateInvitation(invitation.token);
  const now = new Date();
  const url = buildInviteUrl(window.location.origin, invitation.token);
  const remainingMs = invitation.expiresAt.getTime() - now.getTime();
  const isExpiringSoon = remainingMs < EXPIRY_WARNING_HOURS * 60 * 60 * 1000;

  const handleDeactivate = () => {
    deactivate.mutate(undefined, {
      onSuccess: () => {
        notifications.show({ color: 'green', message: '招待リンクを停止しました' });
      },
    });
  };

  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="wrap">
            <Badge color="green" variant="light" size="lg">
              有効
            </Badge>
            {invitation.description && <Text fw={500}>{invitation.description}</Text>}
          </Group>

          <Popover width={260} position="bottom-end" withArrow>
            <Popover.Target>
              <Button variant="light" color="red" leftSection={<IconBan size={16} stroke={1.5} />}>
                停止
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm">
                <Text size="sm">
                  この招待リンクを停止します。停止すると誰も使用できなくなり、元に戻せません。
                </Text>
                <Button
                  color="red"
                  fullWidth
                  loading={deactivate.isPending}
                  onClick={handleDeactivate}
                >
                  停止する
                </Button>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>

        <Group gap="sm" wrap="nowrap">
          <TextInput readOnly value={url} style={{ flex: 1 }} />
          <CopyButton value={url} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                leftSection={
                  copied ? (
                    <IconCheck size={16} stroke={1.5} />
                  ) : (
                    <IconCopy size={16} stroke={1.5} />
                  )
                }
                {...(copied ? { color: 'teal' } : {})}
                onClick={copy}
              >
                {copied ? 'コピーしました' : 'リンクをコピー'}
              </Button>
            )}
          </CopyButton>
        </Group>

        <Group gap="lg">
          <Tooltip label={formatDateTime(invitation.expiresAt)}>
            <Group gap={4} wrap="nowrap">
              <IconClock size={16} stroke={1.5} />
              <Text
                size="sm"
                c={isExpiringSoon ? 'orange' : 'dimmed'}
                fw={isExpiringSoon ? 500 : undefined}
              >
                残り {remainingLabel(invitation.expiresAt, now)} で失効
              </Text>
            </Group>
          </Tooltip>
          <Group gap={4} wrap="nowrap">
            <IconUsers size={16} stroke={1.5} />
            <Text size="sm" c="dimmed">
              これまでの使用: {invitation.usedCount} 回
            </Text>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}
