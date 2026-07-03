import { useState } from 'react';

import { Alert, Button, Card, Stack, TextInput } from '@mantine/core';

import { useCreateShiftType } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * シフト種別作成フォーム。name を入力して POST する。
 */
export function ShiftTypeForm({ onSuccess }: Props) {
  const [name, setName] = useState('');
  const create = useCreateShiftType();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ name }, onSuccess ? { onSuccess } : undefined);
  };

  return (
    <Card component="form" onSubmit={handleSubmit} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <TextInput
          label="種別名"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={100}
          placeholder="例: 終日、午前、午後"
        />

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Button type="submit" loading={create.isPending}>
          作成
        </Button>
      </Stack>
    </Card>
  );
}
