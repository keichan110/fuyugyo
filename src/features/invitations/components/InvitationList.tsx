import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import { useCreateInvitation, useDeactivateInvitation, useInvitations } from '../queries';
import type { Invitation } from '../schema';

/** 日付を YYYY/MM/DD HH:mm 形式でフォーマットする */
function formatDate(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 招待トークン管理コンポーネント（ADMIN/MANAGER 専用）。
 * 一覧表示・新規作成・無効化操作を提供する。
 */
export function InvitationList() {
  const { data: invitations, isLoading, isError } = useInvitations();
  const [showForm, setShowForm] = useState(false);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>招待管理</Title>
        <Button size="sm" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '新規招待を作成'}
        </Button>
      </Group>

      {showForm && <InvitationCreateForm onCreated={() => setShowForm(false)} />}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">招待一覧の取得に失敗しました</Alert>}

      {!isLoading && invitations?.length === 0 && (
        <Text c="dimmed" size="sm">
          招待がありません
        </Text>
      )}

      {invitations && invitations.length > 0 && (
        <Stack gap="sm">
          {invitations.map((inv) => (
            <InvitationItem key={inv.token} invitation={inv} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type InvitationCreateFormProps = {
  onCreated: () => void;
};

/** 招待トークン作成フォーム */
function InvitationCreateForm({ onCreated }: InvitationCreateFormProps) {
  const create = useCreateInvitation();
  const [description, setDescription] = useState('');
  const [maxUses, setMaxUses] = useState<string | number>('');
  const [expiresInHours, setExpiresInHours] = useState<string | number>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        description: description || undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <Card component="form" onSubmit={handleSubmit} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <TextInput
          label="説明（任意）"
          maxLength={255}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="例: スタッフ採用用"
        />

        <Group gap="lg">
          <NumberInput
            label="使用上限（任意）"
            min={1}
            value={maxUses}
            onChange={setMaxUses}
            placeholder="無制限"
            w={112}
          />

          <NumberInput
            label="有効期間（時間・任意）"
            min={1}
            max={8760}
            value={expiresInHours}
            onChange={setExpiresInHours}
            placeholder="デフォルト"
            w={112}
          />
        </Group>

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Button type="submit" size="sm" loading={create.isPending}>
          作成する
        </Button>
      </Stack>
    </Card>
  );
}

type InvitationItemProps = {
  invitation: Invitation;
};

/** 招待トークンの1行表示。URLコピーと無効化ボタンを持つ。 */
function InvitationItem({ invitation }: InvitationItemProps) {
  const deactivate = useDeactivateInvitation(invitation.token);
  const [copied, setCopied] = useState(false);
  const isExpired = invitation.expiresAt <= new Date();
  const isOverLimit = invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses;
  const isInvalid = !invitation.isActive || isExpired || isOverLimit;

  const inviteUrl = `${window.location.origin}/api/auth/line/login?invite=${invitation.token}&redirect=/`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードAPIが利用できない場合（非セキュアコンテキスト等）にフォールバックする
      window.prompt('URLをコピーしてください:', inviteUrl);
    }
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          {invitation.description && <Text fw={500}>{invitation.description}</Text>}
          <Group gap="sm">
            <Text c="dimmed" size="xs">
              使用回数: {invitation.usedCount}
              {invitation.maxUses !== null ? ` / ${invitation.maxUses}` : ''}
            </Text>
            <Text c="dimmed" size="xs">
              有効期限: {formatDate(invitation.expiresAt)}
            </Text>
          </Group>

          <Group gap="xs">
            {!invitation.isActive && (
              <Badge color="gray" variant="light" size="sm">
                無効化済み
              </Badge>
            )}
            {invitation.isActive && isExpired && (
              <Badge color="red" variant="light" size="sm">
                期限切れ
              </Badge>
            )}
            {invitation.isActive && !isExpired && isOverLimit && (
              <Badge color="orange" variant="light" size="sm">
                上限到達
              </Badge>
            )}
            {!isInvalid && (
              <Badge color="green" variant="light" size="sm">
                有効
              </Badge>
            )}
          </Group>
        </Stack>

        <Group gap="xs" wrap="nowrap">
          {!isInvalid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? 'コピー済み' : 'URLをコピー'}
            </Button>
          )}
          {invitation.isActive && (
            <Button
              size="sm"
              color="red"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate()}
            >
              無効化
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  );
}
