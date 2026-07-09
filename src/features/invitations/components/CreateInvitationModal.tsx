import { useState } from 'react';

import {
  Alert,
  Button,
  Group,
  Input,
  Modal,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';

import { DEFAULT_EXPIRY_HOURS, EXPIRY_PRESETS } from '../lib';
import { useCreateInvitation } from '../queries';

type CreateInvitationModalProps = {
  opened: boolean;
  onClose: () => void;
  /** 現在有効な招待リンクがあるか。発行すると自動的に置き換わる旨の警告表示を出し分けるために使う */
  hasActiveInvitation: boolean;
};

/**
 * 招待リンクの発行モーダル。
 * 期限プリセット + 任意メモのみを入力させる簡素なフォーム（maxUsesはUIから外す）。
 */
export function CreateInvitationModal({
  opened,
  onClose,
  hasActiveInvitation,
}: CreateInvitationModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="招待リンクを発行" centered>
      {/* Modal を開き直すたびにフォーム本体を再マウントし、入力状態をリセットする */}
      {opened && (
        <CreateInvitationForm hasActiveInvitation={hasActiveInvitation} onClose={onClose} />
      )}
    </Modal>
  );
}

type CreateInvitationFormProps = {
  onClose: () => void;
  hasActiveInvitation: boolean;
};

/** 招待リンク発行フォームの本体。Modal の開閉ごとに再マウントされる前提で状態を持つ。 */
function CreateInvitationForm({ onClose, hasActiveInvitation }: CreateInvitationFormProps) {
  const create = useCreateInvitation();
  const [expiresInHours, setExpiresInHours] = useState(DEFAULT_EXPIRY_HOURS);
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { expiresInHours, description: description.trim() || undefined },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: hasActiveInvitation
              ? '招待リンクを置き換えました'
              : '招待リンクを発行しました',
          });
          onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        {hasActiveInvitation && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} stroke={1.5} />}>
            現在有効な招待リンクは自動的に停止され、新しいリンクに置き換わります。
          </Alert>
        )}

        <div>
          <Input.Label>有効期限</Input.Label>
          <SegmentedControl
            fullWidth
            value={String(expiresInHours)}
            onChange={(value) => setExpiresInHours(Number(value))}
            data={EXPIRY_PRESETS.map((preset) => ({
              label: preset.label,
              value: String(preset.hours),
            }))}
          />
        </div>

        <TextInput
          label="メモ（任意）"
          maxLength={255}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="例: スタッフ採用用"
        />

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" loading={create.isPending}>
            発行する
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
