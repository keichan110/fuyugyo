import { useState } from 'react';

import { Button, EmptyState, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconLink } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';

import { findActiveInvitation } from '../lib';
import { useInvitations } from '../queries';
import { ActiveInvitationCard } from './ActiveInvitationCard';
import { CreateInvitationModal } from './CreateInvitationModal';
import { InvitationHistoryTable } from './InvitationHistoryTable';

/**
 * 招待リンク管理画面のトップレベルコンポーネント（ADMIN/MANAGER 専用）。
 * 有効な招待リンクは常に1件のみという前提のもと、ヒーローカード + 発行履歴の
 * 読み取り専用ログという構成で表示する。
 */
export function InvitationManager() {
  const { data: invitations, isLoading, isError } = useInvitations();
  const [modalOpened, setModalOpened] = useState(false);

  const now = new Date();
  const active = invitations ? findActiveInvitation(invitations, now) : undefined;
  // アクティブはヒーローに出すため履歴から除外する
  const history = (invitations ?? []).filter((inv) => inv.token !== active?.token);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>招待管理</Title>
          <Text c="dimmed" size="sm">
            有効な招待リンクは常に1件のみです。新しく発行すると既存のリンクは自動的に置き換わります。
          </Text>
        </div>
        <Button
          leftSection={<IconLink size={16} stroke={1.5} />}
          onClick={() => setModalOpened(true)}
        >
          招待リンクを発行
        </Button>
      </Group>

      {isLoading && (
        <Stack gap="lg">
          <Skeleton height={180} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
      )}

      {isError && <ErrorAlert>招待情報の取得に失敗しました</ErrorAlert>}

      {!isLoading && !isError && active && <ActiveInvitationCard invitation={active} />}

      {!isLoading && !isError && !active && (
        <EmptyState
          icon={<IconLink size={32} stroke={1.5} />}
          title="有効な招待リンクはありません"
          description="招待リンクを発行してメンバーを招待しましょう。"
        >
          <EmptyState.Actions>
            <Button
              leftSection={<IconLink size={16} stroke={1.5} />}
              onClick={() => setModalOpened(true)}
            >
              招待リンクを発行
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      )}

      {!isLoading && !isError && (
        <Stack gap="sm">
          <Title order={3} size="h4">
            発行履歴
          </Title>
          <InvitationHistoryTable invitations={history} />
        </Stack>
      )}

      <CreateInvitationModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        hasActiveInvitation={!!active}
      />
    </Stack>
  );
}
