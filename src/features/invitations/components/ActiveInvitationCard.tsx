import {
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

import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';

import { buildInviteUrl, formatDateTime, remainingLabel } from '../lib';
import { useDeactivateInvitation } from '../queries';
import type { Invitation } from '../schema';
import classes from './active-invitation-card.module.css';

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
        <Group gap="sm" wrap="wrap">
          <AppBadge kind="active" size="lg">
            有効
          </AppBadge>
          {invitation.description && <Text fw={500}>{invitation.description}</Text>}
        </Group>

        <div className={classes.invitationActions}>
          <TextInput className={classes.urlInput} readOnly value={url} />
          <CopyButton value={url} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                className={classes.copyButton}
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
                コピー
              </Button>
            )}
          </CopyButton>
          <Popover width={260} position="bottom-end" withArrow>
            <Popover.Target>
              <AppButton
                className={classes.deactivateButton}
                compact
                intent="danger"
                emphasis="low"
                leftSection={<IconBan size={16} stroke={1.5} />}
              >
                停止
              </AppButton>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm">
                <Text size="sm">
                  この招待リンクを停止します。停止すると誰も使用できなくなり、元に戻せません。
                </Text>
                <AppButton
                  intent="danger"
                  emphasis="high"
                  fullWidth
                  loading={deactivate.isPending}
                  onClick={handleDeactivate}
                >
                  停止する
                </AppButton>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </div>

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
