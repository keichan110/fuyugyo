import { useEffect, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { useCertifications } from '@/features/certifications/queries';

import {
  useAssignCertification,
  useChangeInstructorStatus,
  useCreateInstructor,
  useInstructor,
  useUnassignCertification,
  useUpdateInstructor,
} from '../queries';
import { InstructorForm, type InstructorFormValues } from './InstructorForm';

/** Drawer が表示するモード（作成 or 特定インストラクターの編集） */
export type InstructorDrawerState = { mode: 'create' } | { mode: 'edit'; instructorId: string };

type Props = {
  state: InstructorDrawerState | null;
  onClose: () => void;
};

/**
 * インストラクターの作成・編集・資格管理・ステータス変更を1つの右 Drawer にまとめたパネル。
 * 作成成功後は同じ Drawer 内で編集モードに切り替わり、続けて資格を割り当てられる。
 */
export function InstructorDrawer({ state, onClose }: Props) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<InstructorDrawerState | null>(null);

  useEffect(() => {
    if (state) {
      setLastState(state);
      if (state.mode === 'create') setCreatedId(null);
    }
  }, [state]);

  const effectiveState = state ?? lastState;
  const editingId =
    effectiveState?.mode === 'edit' ? effectiveState.instructorId : (createdId ?? undefined);

  const create = useCreateInstructor();

  const handleCreate = (values: InstructorFormValues) => {
    create.mutate(
      {
        lastName: values.lastName,
        firstName: values.firstName,
        lastNameKana: values.lastNameKana || undefined,
        firstNameKana: values.firstNameKana || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: (created) => {
          notifications.show({
            color: 'green',
            message: `${created.lastName} ${created.firstName} を作成しました`,
          });
          setCreatedId(created.id);
        },
      },
    );
  };

  return (
    <Drawer
      opened={state !== null}
      onClose={onClose}
      position="right"
      size="md"
      title={editingId ? 'インストラクターを編集' : 'インストラクターを追加'}
    >
      {editingId ? (
        <InstructorEditPanel instructorId={editingId} />
      ) : (
        <Stack gap="sm">
          <InstructorForm submitLabel="作成" loading={create.isPending} onSubmit={handleCreate} />
          {create.isError && <Alert color="red">{create.error.message}</Alert>}
        </Stack>
      )}
    </Drawer>
  );
}

type InstructorEditPanelProps = {
  instructorId: string;
};

/** 編集モードの中身。基本情報フォーム・保有資格・ステータス切り替えの3セクション構成。 */
function InstructorEditPanel({ instructorId }: InstructorEditPanelProps) {
  const [selectedCertId, setSelectedCertId] = useState('');
  const { data: detail, isLoading: detailLoading } = useInstructor(instructorId);
  // 無効化された資格の名前も表示できるよう全件取得する
  const { data: allCerts } = useCertifications(false);
  const update = useUpdateInstructor(instructorId);
  const changeStatus = useChangeInstructorStatus(instructorId);
  const assign = useAssignCertification(instructorId);
  const unassign = useUnassignCertification(instructorId);

  if (detailLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  const certMap = new Map(allCerts?.map((c) => [c.id, c]) ?? []);
  const assignedCertIds = new Set(detail.certifications.map((ic) => ic.certificationId));
  // 割り当てフォームにはアクティブかつ未割り当ての資格のみ表示する
  const availableCerts = allCerts?.filter((c) => c.isActive && !assignedCertIds.has(c.id)) ?? [];
  const isActive = detail.status === 'ACTIVE';

  const handleUpdate = (values: InstructorFormValues) => {
    update.mutate(
      {
        lastName: values.lastName,
        firstName: values.firstName,
        lastNameKana: values.lastNameKana || null,
        firstNameKana: values.firstNameKana || null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: `${values.lastName} ${values.firstName} を保存しました`,
          });
        },
      },
    );
  };

  const handleAssign = () => {
    if (!selectedCertId) return;
    assign.mutate(
      { certificationId: selectedCertId },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: '資格を割り当てました' });
          setSelectedCertId('');
        },
      },
    );
  };

  const handleUnassign = (certificationId: string) => {
    unassign.mutate(certificationId, {
      onSuccess: () => notifications.show({ color: 'green', message: '資格を解除しました' }),
    });
  };

  const handleToggleStatus = () => {
    const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';
    changeStatus.mutate(
      { status: nextStatus },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: nextStatus === 'ACTIVE' ? 'アクティブにしました' : '非アクティブにしました',
          });
        },
      },
    );
  };

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <InstructorForm
          initialValues={{
            lastName: detail.lastName,
            firstName: detail.firstName,
            lastNameKana: detail.lastNameKana ?? '',
            firstNameKana: detail.firstNameKana ?? '',
            notes: detail.notes ?? '',
          }}
          submitLabel="保存"
          loading={update.isPending}
          onSubmit={handleUpdate}
        />
        {update.isError && <Alert color="red">{update.error.message}</Alert>}
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text fw={500} size="sm">
          保有資格
        </Text>
        {detail.certifications.length > 0 ? (
          <Group gap="xs">
            {detail.certifications.map((ic) => {
              const cert = certMap.get(ic.certificationId);
              return (
                <Badge
                  key={ic.id}
                  variant="light"
                  color={cert && !cert.isActive ? 'gray' : 'blue'}
                  rightSection={
                    <CloseButton
                      size="xs"
                      disabled={unassign.isPending}
                      onClick={() => handleUnassign(ic.certificationId)}
                    />
                  }
                >
                  {cert ? `${cert.name}（${cert.shortName}）` : ic.certificationId}
                </Badge>
              );
            })}
          </Group>
        ) : (
          <Text c="dimmed" size="sm">
            割り当て済みの資格がありません
          </Text>
        )}

        {availableCerts.length > 0 && (
          <Group wrap="nowrap">
            <Select
              placeholder="資格を選択してください"
              data={availableCerts.map((cert) => ({
                value: cert.id,
                label: `${cert.name}（${cert.shortName}）`,
              }))}
              value={selectedCertId || null}
              onChange={(value) => setSelectedCertId(value ?? '')}
              style={{ flex: 1 }}
            />
            <Button
              size="sm"
              loading={assign.isPending}
              disabled={!selectedCertId}
              onClick={handleAssign}
            >
              割り当て
            </Button>
          </Group>
        )}
        {assign.isError && <Alert color="red">{assign.error.message}</Alert>}
        {unassign.isError && <Alert color="red">{unassign.error.message}</Alert>}
      </Stack>

      <Divider />

      <Group justify="space-between">
        <div>
          <Text fw={500} size="sm">
            ステータス
          </Text>
          <Text c="dimmed" size="xs">
            {isActive ? 'アクティブ' : '非アクティブ'}
          </Text>
        </div>
        <Switch
          checked={isActive}
          disabled={changeStatus.isPending}
          onChange={handleToggleStatus}
        />
      </Group>
      {changeStatus.isError && <Alert color="red">{changeStatus.error.message}</Alert>}
    </Stack>
  );
}
