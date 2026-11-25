import { useState } from 'react';

import { Collapse, CopyButton, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBrandLine, IconCheck, IconChevronDown, IconCopy, IconLink } from '@tabler/icons-react';

import { ErrorAlert, InfoAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';

import { buildInviteUrl, buildLineShareUrl, buildShareMessage, formatDateTimeJst } from '../lib';
import { useDeactivateInvitation, useInvitations, useIssueInvitation } from '../queries';
import type { Invitation } from '../schema';

/**
 * ユーザー管理の ListHeader に置く「招待リンク」ボタンとモーダル（ADMIN 専用）。
 * ボタンを押すとモーダルを開き、同時に招待リンクを発行（1時間以内の既存リンクは再利用）する。
 */
export function InvitationLinkButton() {
  const [opened, setOpened] = useState(false);
  const issue = useIssueInvitation();
  const deactivate = useDeactivateInvitation();
  // 停止したトークン。現在表示中のリンクが停止済みかどうかの判定に使う
  const [stoppedToken, setStoppedToken] = useState<string | null>(null);
  const [listOpened, setListOpened] = useState(false);
  const { data: invitations } = useInvitations(opened);
  const isDesktop = useMediaQuery('(min-width: 48em)');

  const handleOpen = () => {
    setOpened(true);
    issue.mutate();
  };

  const handleDeactivate = (token: string) => {
    deactivate.mutate(token, {
      onSuccess: () => {
        setStoppedToken(token);
        notifications.show({ color: 'green', message: '招待リンクを停止しました' });
      },
      onError: (error) => {
        notifications.show({ color: 'red', message: error.message });
      },
    });
  };

  const current = issue.data;
  const isStopped = current !== undefined && stoppedToken === current.token;

  return (
    <>
      <AppButton
        intent="secondary"
        leftSection={<IconLink size={16} stroke={1.5} />}
        onClick={handleOpen}
      >
        招待リンク
      </AppButton>
      <Modal opened={opened} onClose={() => setOpened(false)} title="招待リンク" centered>
        <Stack gap="md">
          {issue.isPending && (
            <Group gap="sm" role="status">
              <Loader size="sm" />
              <Text size="sm">招待リンクを発行しています…</Text>
            </Group>
          )}

          {issue.isError && (
            <Stack gap="sm">
              <ErrorAlert>{issue.error.message}</ErrorAlert>
              <AppButton intent="secondary" onClick={() => issue.mutate()}>
                再試行
              </AppButton>
            </Stack>
          )}

          {current && !issue.isPending && (
            <CurrentInvitation
              invitation={current}
              isStopped={isStopped}
              isDesktop={isDesktop}
              onReissue={() => issue.mutate()}
            />
          )}

          <Stack gap="xs">
            <AppButton
              intent="tertiary"
              aria-expanded={listOpened}
              rightSection={<IconChevronDown size={16} stroke={1.5} />}
              onClick={() => setListOpened((value) => !value)}
            >
              発行済みの招待リンク
            </AppButton>
            <Collapse expanded={listOpened}>
              <Stack gap="xs">
                {invitations?.length === 0 && (
                  <Text size="sm" c="dimmed">
                    有効な招待リンクはありません
                  </Text>
                )}
                {invitations?.map((item) => (
                  <Group key={item.token} justify="space-between" wrap="nowrap" gap="sm">
                    <Stack gap={0}>
                      <Text size="sm">{item.createdByName ?? '削除済みのユーザー'}</Text>
                      <Text size="xs" c="dimmed">
                        {formatDateTimeJst(item.expiresAt)} まで・使用 {item.usedCount} 回
                      </Text>
                    </Stack>
                    <AppButton
                      intent="danger"
                      emphasis="low"
                      compact
                      loading={deactivate.isPending && deactivate.variables === item.token}
                      onClick={() => handleDeactivate(item.token)}
                    >
                      停止
                    </AppButton>
                  </Group>
                ))}
              </Stack>
            </Collapse>
          </Stack>
        </Stack>
      </Modal>
    </>
  );
}

type CurrentInvitationProps = {
  invitation: Invitation;
  /** 現在のリンクが停止済みか。停止済みなら共有操作を無効化し、再発行だけ提供する */
  isStopped: boolean;
  isDesktop: boolean;
  onReissue: () => void;
};

/** 発行したリンクの URL・期限・共有文面と、コピー・LINE 共有の操作を表示する。 */
function CurrentInvitation({
  invitation,
  isStopped,
  isDesktop,
  onReissue,
}: CurrentInvitationProps) {
  const url = buildInviteUrl(window.location.origin, invitation.token);
  const message = buildShareMessage(invitation.expiresAt);
  const lineShareUrl = buildLineShareUrl(message, url);

  return (
    <Stack gap="sm">
      <TextInput label="招待リンク" readOnly value={url} />
      <Text size="sm">有効期限: {formatDateTimeJst(invitation.expiresAt)}（日本時間）</Text>
      <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
        {message}
      </Text>

      {isStopped ? (
        <Stack gap="sm">
          <InfoAlert>
            このリンクは停止しました。共有するには新しいリンクを発行してください。
          </InfoAlert>
          <Group gap="sm">
            <AppButton intent="primary" onClick={onReissue}>
              新しいリンクを発行
            </AppButton>
          </Group>
        </Stack>
      ) : (
        <Group gap="sm" justify="flex-end" wrap="wrap">
          <CopyButton value={url} timeout={2000}>
            {({ copied, copy }) =>
              isDesktop ? (
                <AppButton
                  intent="primary"
                  success={copied}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={copy}
                >
                  {copied ? 'コピーしました' : 'リンクをコピー'}
                </AppButton>
              ) : (
                <AppButton
                  intent="secondary"
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={copy}
                >
                  {copied ? 'コピーしました' : 'リンクをコピー'}
                </AppButton>
              )
            }
          </CopyButton>
          {isDesktop ? (
            <AppButton
              intent="secondary"
              component="a"
              href={lineShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<IconBrandLine size={16} />}
            >
              LINE で送る
            </AppButton>
          ) : (
            <AppButton
              intent="primary"
              component="a"
              href={lineShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<IconBrandLine size={16} />}
            >
              LINE で送る
            </AppButton>
          )}
        </Group>
      )}
    </Stack>
  );
}
