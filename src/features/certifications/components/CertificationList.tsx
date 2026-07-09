import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';

import { useDepartments } from '@/features/departments/queries';

import { useCertifications, useDeactivateCertification, useUpdateCertification } from '../queries';
import { CertificationForm } from './CertificationForm';

/** テーブルの列数（編集モードの colSpan に使用） */
const COL_COUNT = 5;

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
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover withTableBorder withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>資格名</Table.Th>
                <Table.Th w={100}>省略名</Table.Th>
                <Table.Th w={120}>部門</Table.Th>
                <Table.Th w={140}>発行団体</Table.Th>
                <Table.Th w={160}>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((cert) => (
                <CertificationRow
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
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

type CertificationRowProps = {
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
function CertificationRow(props: CertificationRowProps) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <CertificationRowEdit {...props} onCancel={() => setEditing(false)} />
  ) : (
    <CertificationRowDisplay {...props} onEdit={() => setEditing(true)} />
  );
}

type CertificationRowDisplayProps = CertificationRowProps & {
  onEdit: () => void;
};

/** 資格の表示モード。無効化ボタンを持つ。 */
function CertificationRowDisplay({
  id,
  name,
  shortName,
  organization,
  description,
  isActive,
  departmentName,
  onEdit,
}: CertificationRowDisplayProps) {
  const deactivate = useDeactivateCertification();

  return (
    <Table.Tr>
      <Table.Td>
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={500}>{name}</Text>
            {!isActive && (
              <Badge color="gray" variant="light" size="sm">
                無効
              </Badge>
            )}
          </Group>
          {description && (
            <Text c="dimmed" size="xs">
              {description}
            </Text>
          )}
        </Stack>
        {deactivate.isError && (
          <Alert color="red" mt="xs">
            {deactivate.error.message}
          </Alert>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="sm" ff="monospace">
          {shortName}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{departmentName}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{organization}</Text>
      </Table.Td>
      <Table.Td>
        {isActive && (
          <Group gap="xs">
            <Button variant="outline" size="xs" onClick={onEdit}>
              編集
            </Button>
            <Button
              variant="outline"
              size="xs"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate(id)}
            >
              無効化
            </Button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

type CertificationRowEditProps = CertificationRowProps & {
  onCancel: () => void;
};

/** 資格の編集モード。フォームを送信して PATCH する。 */
function CertificationRowEdit({
  id,
  name,
  shortName,
  organization,
  description,
  onCancel,
}: CertificationRowEditProps) {
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
    <Table.Tr>
      <Table.Td colSpan={COL_COUNT}>
        <Stack component="form" onSubmit={handleUpdate} gap="sm">
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
            <Button type="submit" size="xs" loading={update.isPending}>
              保存
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={onCancel}>
              キャンセル
            </Button>
          </Group>
          {update.isError && <Alert color="red">{update.error.message}</Alert>}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}
