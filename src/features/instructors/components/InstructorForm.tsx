import { useState } from 'react';

import { Alert, Button, Card, Group, Stack, Textarea, TextInput } from '@mantine/core';

import { useCreateInstructor } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * インストラクター作成フォーム。姓・名・カナ・備考を入力して POST する。
 */
export function InstructorForm({ onSuccess }: Props) {
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastNameKana, setLastNameKana] = useState('');
  const [firstNameKana, setFirstNameKana] = useState('');
  const [notes, setNotes] = useState('');

  const create = useCreateInstructor();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        lastName,
        firstName,
        lastNameKana: lastNameKana || undefined,
        firstNameKana: firstNameKana || undefined,
        notes: notes || undefined,
      },
      onSuccess ? { onSuccess } : undefined,
    );
  };

  return (
    <Card component="form" onSubmit={handleSubmit} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group grow>
          <TextInput
            label="姓"
            required
            value={lastName}
            onChange={(e) => setLastName(e.currentTarget.value)}
            maxLength={50}
            placeholder="例: 山田"
          />
          <TextInput
            label="名"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.currentTarget.value)}
            maxLength={50}
            placeholder="例: 太郎"
          />
        </Group>

        <Group grow>
          <TextInput
            label="姓（カナ）"
            value={lastNameKana}
            onChange={(e) => setLastNameKana(e.currentTarget.value)}
            maxLength={50}
            placeholder="例: ヤマダ"
          />
          <TextInput
            label="名（カナ）"
            value={firstNameKana}
            onChange={(e) => setFirstNameKana(e.currentTarget.value)}
            maxLength={50}
            placeholder="例: タロウ"
          />
        </Group>

        <Textarea
          label="備考"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          maxLength={500}
          rows={2}
          placeholder="備考（任意）"
        />

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Button type="submit" loading={create.isPending}>
          作成
        </Button>
      </Stack>
    </Card>
  );
}
