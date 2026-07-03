import { useState } from 'react';

import { Alert, Button, Card, Select, Stack, Textarea, TextInput } from '@mantine/core';

import { useDepartments } from '@/features/departments/queries';

import { useCreateCertification } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * 資格作成フォーム。departmentId・name・shortName・organization・description を入力して POST する。
 */
export function CertificationForm({ onSuccess }: Props) {
  const [departmentId, setDepartmentId] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [organization, setOrganization] = useState('');
  const [description, setDescription] = useState('');

  const { data: departments } = useDepartments(true);
  const create = useCreateCertification();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        departmentId,
        name,
        shortName,
        organization,
        description: description || undefined,
      },
      onSuccess ? { onSuccess } : undefined,
    );
  };

  return (
    <Card component="form" onSubmit={handleSubmit} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Select
          label="部門"
          required
          placeholder="部門を選択してください"
          data={(departments ?? []).map((dept) => ({ value: dept.id, label: dept.name }))}
          value={departmentId || null}
          onChange={(value) => setDepartmentId(value ?? '')}
        />

        <TextInput
          label="資格名"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={100}
          placeholder="例: スキー指導員"
        />

        <TextInput
          label="省略名"
          required
          value={shortName}
          onChange={(e) => setShortName(e.currentTarget.value)}
          maxLength={20}
          placeholder="例: 指導員"
        />

        <TextInput
          label="発行団体"
          required
          value={organization}
          onChange={(e) => setOrganization(e.currentTarget.value)}
          maxLength={100}
          placeholder="例: 全日本スキー連盟"
        />

        <Textarea
          label="説明"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          maxLength={500}
          rows={2}
          placeholder="資格の説明（任意）"
        />

        {create.isError && <Alert color="red">{create.error.message}</Alert>}

        <Button type="submit" loading={create.isPending}>
          作成
        </Button>
      </Stack>
    </Card>
  );
}
