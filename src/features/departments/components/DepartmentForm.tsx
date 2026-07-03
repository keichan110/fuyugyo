import { useState } from 'react';

import { Alert, Button, Card, Stack, Textarea, TextInput } from '@mantine/core';

import { useCreateDepartment } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * 部門作成フォーム。code・name・description を入力して POST する。
 */
export function DepartmentForm({ onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateDepartment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { code, name, description: description || undefined },
      onSuccess ? { onSuccess } : undefined,
    );
  };

  return (
    <Card component="form" onSubmit={handleSubmit} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <TextInput
          label="部門コード"
          required
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
          maxLength={32}
          placeholder="例: ski"
        />

        <TextInput
          label="部門名"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={100}
          placeholder="例: スキー"
        />

        <Textarea
          label="説明"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          maxLength={500}
          rows={2}
          placeholder="部門の説明（任意）"
        />

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Button type="submit" loading={create.isPending}>
          作成
        </Button>
      </Stack>
    </Card>
  );
}
