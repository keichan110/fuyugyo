import { Group, Paper, Stack, Text } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';

import { AppButton } from './AppButton';
import classes from './UnsavedChangesBar.module.css';

type UnsavedChangesBarProps = {
  count?: number;
  description?: string;
  loading?: boolean;
  saveLabel?: string;
  onCancel: () => void;
  onSave: () => void;
};

/** 通常画面の未保存変更に対するキャンセル・保存操作を、画面下部へ共通表示する。 */
export function UnsavedChangesBar({
  count,
  description = 'この画面の変更をまとめて保存します',
  loading = false,
  saveLabel = '変更を保存',
  onCancel,
  onSave,
}: UnsavedChangesBarProps) {
  const changeLabel = count === undefined ? '未保存の変更があります' : `未保存の変更 ${count}件`;

  return (
    <Paper className={classes.bar} withBorder shadow="lg" p="sm" role="region" aria-live="polite">
      <Group className={classes.content} justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text fw={700}>{changeLabel}</Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </Stack>
        <Group className={classes.actions} gap="xs" wrap="nowrap">
          <AppButton intent="secondary" onClick={onCancel} disabled={loading}>
            キャンセル
          </AppButton>
          <AppButton
            intent="primary"
            leftSection={<IconDeviceFloppy size={18} />}
            onClick={onSave}
            loading={loading}
          >
            {saveLabel}
          </AppButton>
        </Group>
      </Group>
    </Paper>
  );
}
