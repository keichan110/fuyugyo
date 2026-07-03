import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';

import { useDepartments } from '@/features/departments/queries';

import { useCertifications, useDeactivateCertification, useUpdateCertification } from '../queries';
import { CertificationForm } from './CertificationForm';

/**
 * 資格一覧と作成・編集・無効化操作を提供するコンポーネント。
 */
export function CertificationList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効資格も表示するため全件取得する
  const { data, isLoading, isError } = useCertifications(false);
  const { data: departments } = useDepartments(false);

  /** departmentId → name のマップ */
  const deptNameMap = new Map(departments?.map((d) => [d.id, d.name]) ?? []);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>資格管理</Title>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '資格を追加'}
        </Button>
      </Group>

      {showForm && <CertificationForm onSuccess={() => setShowForm(false)} />}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">資格一覧の取得に失敗しました</Alert>}

      {data && data.length === 0 && (
        <Text c="dimmed" size="sm">
          資格がありません
        </Text>
      )}

      {data && data.length > 0 && (
        <Stack gap="sm">
          {data.map((cert) => (
            <CertificationItem
              key={cert.id}
              id={cert.id}
              name={cert.name}
              shortName={cert.shortName}
              organization={cert.organization}
              description={cert.description}
              isActive={cert.isActive}
              departmentName={deptNameMap.get(cert.departmentId) ?? cert.departmentId}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type CertificationItemProps = {
  id: string;
  name: string;
  shortName: string;
  organization: string;
  description: string | null;
  isActive: boolean;
  departmentName: string;
};

/**
 * 資格の1行表示。編集モードと表示モードを切り替える。
 */
function CertificationItem(props: CertificationItemProps) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <CertificationItemEdit {...props} onCancel={() => setEditing(false)} />
  ) : (
    <CertificationItemDisplay {...props} onEdit={() => setEditing(true)} />
  );
}

type CertificationItemDisplayProps = CertificationItemProps & {
  onEdit: () => void;
};

/** 資格の表示モード。無効化ボタンを持つ。 */
function CertificationItemDisplay({
  id,
  name,
  shortName,
  organization,
  description,
  isActive,
  departmentName,
  onEdit,
}: CertificationItemDisplayProps) {
  const deactivate = useDeactivateCertification();

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4}>
            <Group gap="xs">
              <Text fw={500}>{name}</Text>
              <Text c="dimmed" size="sm" ff="monospace">
                ({shortName})
              </Text>
              {!isActive && (
                <Badge color="gray" variant="light" size="sm">
                  無効
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="sm">
              {departmentName} ／ {organization}
            </Text>
            {description && (
              <Text c="dimmed" size="sm">
                {description}
              </Text>
            )}
          </Stack>
          {isActive && (
            <Group gap="xs" wrap="nowrap">
              <Button variant="outline" size="sm" onClick={onEdit}>
                編集
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={deactivate.isPending}
                onClick={() => deactivate.mutate(id)}
              >
                無効化
              </Button>
            </Group>
          )}
        </Group>
        {deactivate.isError && <Alert color="red">{deactivate.error.message}</Alert>}
      </Stack>
    </Card>
  );
}

type CertificationItemEditProps = CertificationItemProps & {
  onCancel: () => void;
};

/** 資格の編集モード。フォームを送信して PATCH する。 */
function CertificationItemEdit({
  id,
  name,
  shortName,
  organization,
  description,
  onCancel,
}: CertificationItemEditProps) {
  const [editName, setEditName] = useState(name);
  const [editShortName, setEditShortName] = useState(shortName);
  const [editOrganization, setEditOrganization] = useState(organization);
  const [editDescription, setEditDescription] = useState(description ?? '');
  const update = useUpdateCertification(id);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        name: editName,
        shortName: editShortName,
        organization: editOrganization,
        description: editDescription || null,
      },
      { onSuccess: onCancel },
    );
  };

  return (
    <Card component="form" onSubmit={handleUpdate} withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group grow>
          <TextInput
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
            required
            maxLength={100}
            placeholder="資格名"
            autoFocus
          />
          <TextInput
            value={editShortName}
            onChange={(e) => setEditShortName(e.currentTarget.value)}
            required
            maxLength={20}
            placeholder="省略名"
          />
        </Group>
        <TextInput
          value={editOrganization}
          onChange={(e) => setEditOrganization(e.currentTarget.value)}
          required
          maxLength={100}
          placeholder="発行団体"
        />
        <Textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.currentTarget.value)}
          maxLength={500}
          rows={2}
          placeholder="説明（任意）"
        />
        <Group gap="xs">
          <Button type="submit" size="sm" loading={update.isPending}>
            保存
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            キャンセル
          </Button>
        </Group>
        {update.isError && <Alert color="red">{update.error.message}</Alert>}
      </Stack>
    </Card>
  );
}
