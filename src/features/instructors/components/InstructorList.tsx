import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';

import { useCertifications } from '@/features/certifications/queries';

import {
  useAssignCertification,
  useChangeInstructorStatus,
  useInstructor,
  useInstructors,
  useUnassignCertification,
  useUpdateInstructor,
} from '../queries';
import type { Instructor } from '../schema';
import { InstructorForm } from './InstructorForm';

/** テーブルの列数（編集・資格管理モードの colSpan に使用） */
const COL_COUNT = 3;

/**
 * インストラクター一覧と作成・編集・ステータス変更・資格管理を提供するコンポーネント。
 */
export function InstructorList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では全ステータスを表示する
  const activeData = useInstructors('ACTIVE');
  const inactiveData = useInstructors('INACTIVE');

  const allInstructors = [...(activeData.data ?? []), ...(inactiveData.data ?? [])];
  const isLoading = activeData.isLoading || inactiveData.isLoading;
  const isError = activeData.isError || inactiveData.isError;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>インストラクター管理</Title>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : 'インストラクターを追加'}
        </Button>
      </Group>

      {showForm && <InstructorForm onSuccess={() => setShowForm(false)} />}

      {isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {isError && <Alert color="red">インストラクター一覧の取得に失敗しました</Alert>}

      {!isLoading && allInstructors.length === 0 && (
        <Text c="dimmed" size="sm">
          インストラクターがいません
        </Text>
      )}

      {allInstructors.length > 0 && (
        <Table.ScrollContainer minWidth={500}>
          <Table highlightOnHover withTableBorder withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>氏名</Table.Th>
                <Table.Th>備考</Table.Th>
                <Table.Th w={260}>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {allInstructors.map((instructor) => (
                <InstructorRow key={instructor.id} instructor={instructor} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

type InstructorRowProps = {
  instructor: Instructor;
};

/**
 * インストラクターの1行表示。編集モードと表示モードを切り替える。
 */
function InstructorRow({ instructor }: InstructorRowProps) {
  const [mode, setMode] = useState<'display' | 'edit' | 'cert'>('display');

  if (mode === 'edit') {
    return <InstructorRowEdit instructor={instructor} onCancel={() => setMode('display')} />;
  }
  if (mode === 'cert') {
    return <InstructorCertManager instructor={instructor} onBack={() => setMode('display')} />;
  }
  return (
    <InstructorRowDisplay
      instructor={instructor}
      onEdit={() => setMode('edit')}
      onManageCert={() => setMode('cert')}
    />
  );
}

type InstructorRowDisplayProps = {
  instructor: Instructor;
  onEdit: () => void;
  onManageCert: () => void;
};

/** インストラクターの表示モード。ステータス変更ボタンを持つ。 */
function InstructorRowDisplay({ instructor, onEdit, onManageCert }: InstructorRowDisplayProps) {
  const changeStatus = useChangeInstructorStatus(instructor.id);
  const isActive = instructor.status === 'ACTIVE';

  const fullName = `${instructor.lastName} ${instructor.firstName}`;
  const fullNameKana =
    instructor.lastNameKana && instructor.firstNameKana
      ? `${instructor.lastNameKana} ${instructor.firstNameKana}`
      : null;

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{fullName}</Text>
          {fullNameKana && (
            <Text c="dimmed" size="sm">
              （{fullNameKana}）
            </Text>
          )}
          {!isActive && (
            <Badge color="gray" variant="light" size="sm">
              非アクティブ
            </Badge>
          )}
        </Group>
        {changeStatus.isError && (
          <Alert color="red" mt="xs">
            {changeStatus.error.message}
          </Alert>
        )}
      </Table.Td>
      <Table.Td>
        {instructor.notes && (
          <Text c="dimmed" size="sm">
            {instructor.notes}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button variant="outline" size="xs" onClick={onEdit}>
            編集
          </Button>
          <Button variant="outline" size="xs" onClick={onManageCert}>
            資格管理
          </Button>
          <Button
            variant="outline"
            size="xs"
            loading={changeStatus.isPending}
            onClick={() => changeStatus.mutate({ status: isActive ? 'INACTIVE' : 'ACTIVE' })}
          >
            {isActive ? '非アクティブ化' : 'アクティブ化'}
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

type InstructorRowEditProps = {
  instructor: Instructor;
  onCancel: () => void;
};

/** インストラクターの編集モード。フォームを送信して PATCH する。 */
function InstructorRowEdit({ instructor, onCancel }: InstructorRowEditProps) {
  const [lastName, setLastName] = useState(instructor.lastName);
  const [firstName, setFirstName] = useState(instructor.firstName);
  const [lastNameKana, setLastNameKana] = useState(instructor.lastNameKana ?? '');
  const [firstNameKana, setFirstNameKana] = useState(instructor.firstNameKana ?? '');
  const [notes, setNotes] = useState(instructor.notes ?? '');
  const update = useUpdateInstructor(instructor.id);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        lastName,
        firstName,
        lastNameKana: lastNameKana || null,
        firstNameKana: firstNameKana || null,
        notes: notes || null,
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
              value={lastName}
              onChange={(e) => setLastName(e.currentTarget.value)}
              required
              maxLength={50}
              placeholder="姓"
              autoFocus
            />
            <TextInput
              value={firstName}
              onChange={(e) => setFirstName(e.currentTarget.value)}
              required
              maxLength={50}
              placeholder="名"
            />
          </Group>
          <Group grow>
            <TextInput
              value={lastNameKana}
              onChange={(e) => setLastNameKana(e.currentTarget.value)}
              maxLength={50}
              placeholder="姓（カナ）"
            />
            <TextInput
              value={firstNameKana}
              onChange={(e) => setFirstNameKana(e.currentTarget.value)}
              maxLength={50}
              placeholder="名（カナ）"
            />
          </Group>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            maxLength={500}
            rows={2}
            placeholder="備考（任意）"
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

type InstructorCertManagerProps = {
  instructor: Instructor;
  onBack: () => void;
};

/**
 * インストラクターの資格管理パネル。
 * useInstructor で詳細データを取得し、資格の割り当て・解除を操作する。
 */
function InstructorCertManager({ instructor, onBack }: InstructorCertManagerProps) {
  const [selectedCertId, setSelectedCertId] = useState('');
  // 詳細（割り当て済み certifications 含む）を API から取得する
  const { data: detail, isLoading: detailLoading } = useInstructor(instructor.id);
  // 無効化された資格の名前も表示できるよう全件取得する
  const { data: allCerts } = useCertifications(false);
  const assign = useAssignCertification(instructor.id);
  const unassign = useUnassignCertification(instructor.id);

  // certificationId → Certification のマップ（名前表示に使用）
  const certMap = new Map(allCerts?.map((c) => [c.id, c]) ?? []);
  const assignedCertIds = new Set(detail?.certifications.map((ic) => ic.certificationId) ?? []);
  // 割り当てフォームにはアクティブかつ未割り当ての資格のみ表示する
  const availableCerts = allCerts?.filter((c) => c.isActive && !assignedCertIds.has(c.id)) ?? [];

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertId) return;
    assign.mutate({ certificationId: selectedCertId }, { onSuccess: () => setSelectedCertId('') });
  };

  return (
    <Table.Tr>
      <Table.Td colSpan={COL_COUNT}>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>
              {instructor.lastName} {instructor.firstName} — 資格管理
            </Text>
            <Button type="button" variant="outline" size="xs" onClick={onBack}>
              戻る
            </Button>
          </Group>

          {detailLoading && (
            <Text c="dimmed" size="sm">
              読み込み中…
            </Text>
          )}

          {/* 割り当て済み一覧 */}
          {!detailLoading &&
            (detail && detail.certifications.length > 0 ? (
              <Stack gap={4}>
                {detail.certifications.map((ic) => {
                  const cert = certMap.get(ic.certificationId);
                  return (
                    <Group key={ic.id} justify="space-between" gap="xs">
                      <Text size="sm">
                        {cert ? `${cert.name}（${cert.shortName}）` : ic.certificationId}
                      </Text>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        loading={unassign.isPending}
                        onClick={() => unassign.mutate(ic.certificationId)}
                      >
                        解除
                      </Button>
                    </Group>
                  );
                })}
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                割り当て済みの資格がありません
              </Text>
            ))}

          {/* 資格割り当てフォーム */}
          {availableCerts.length > 0 && (
            <Group component="form" onSubmit={handleAssign} wrap="nowrap">
              <Select
                placeholder="資格を選択してください"
                required
                data={availableCerts.map((cert) => ({
                  value: cert.id,
                  label: `${cert.name}（${cert.shortName}）`,
                }))}
                value={selectedCertId || null}
                onChange={(value) => setSelectedCertId(value ?? '')}
                style={{ flex: 1 }}
              />
              <Button type="submit" size="xs" loading={assign.isPending} disabled={!selectedCertId}>
                割り当て
              </Button>
            </Group>
          )}

          {assign.isError && <Alert color="red">{assign.error.message}</Alert>}
          {unassign.isError && <Alert color="red">{unassign.error.message}</Alert>}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}
