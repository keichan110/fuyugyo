import { useEffect, useState } from 'react';

import {
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

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { FormFooterButtons } from '@/components/FormFooterButtons';
import { useCertifications } from '@/features/certifications/queries';
import type { Certification } from '@/features/certifications/schema';

import {
  useAssignCertification,
  useChangeInstructorStatus,
  useCreateInstructor,
  useInstructor,
  useUnassignCertification,
  useUpdateInstructor,
} from '../queries';
import type { InstructorStatus, InstructorWithCertifications } from '../schema';
import { InstructorFormFields } from './InstructorForm';
import { useInstructorForm, type InstructorFormValues } from './useInstructorForm';

/** Drawer が表示するモード（作成 or 特定インストラクターの編集） */
export type InstructorDrawerState = { mode: 'create' } | { mode: 'edit'; instructorId: string };

type Props = {
  state: InstructorDrawerState | null;
  onClose: () => void;
};

/**
 * インストラクターの作成・編集・資格管理・ステータス変更を1つの右 Drawer にまとめたパネル。
 * 基本情報・保有資格・ステータスを1フォームとして扱い、保存で一括反映・キャンセルで破棄する。
 */
export function InstructorDrawer({ state, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<InstructorDrawerState | null>(null);

  useEffect(() => {
    if (state) setLastState(state);
  }, [state]);

  const effectiveState = state ?? lastState;
  const isEdit = effectiveState?.mode === 'edit';

  return (
    <Drawer
      opened={state !== null}
      onClose={onClose}
      title={isEdit ? 'インストラクターを編集' : 'インストラクターを追加'}
    >
      {effectiveState?.mode === 'edit' ? (
        <EditPanel
          key={effectiveState.instructorId}
          instructorId={effectiveState.instructorId}
          onClose={onClose}
        />
      ) : (
        <CreatePanel onClose={onClose} />
      )}
    </Drawer>
  );
}

type CertEditorProps = {
  allCerts: Certification[] | undefined;
  /** 現在フォーム上で選択されている資格 ID（未確定のローカル状態） */
  pendingCertIds: string[];
  onAdd: (certId: string) => void;
  onRemove: (certId: string) => void;
};

/**
 * 保有資格の編集セクション。Select で選択すると即座にローカルへ追加され（割り当てボタン不要）、
 * バッジの × で除去する。実際の割り当て・解除はフォーム保存時にまとめて反映される。
 */
function CertEditor({ allCerts, pendingCertIds, onAdd, onRemove }: CertEditorProps) {
  const certMap = new Map(allCerts?.map((c) => [c.id, c]) ?? []);
  const pendingSet = new Set(pendingCertIds);
  // 追加候補にはアクティブかつ未選択の資格のみ表示する
  const available = allCerts?.filter((c) => c.isActive && !pendingSet.has(c.id)) ?? [];

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        保有資格
      </Text>
      {pendingCertIds.length > 0 ? (
        <Group gap="xs">
          {pendingCertIds.map((id) => {
            const cert = certMap.get(id);
            return (
              <AppBadge
                key={id}
                kind={cert && !cert.isActive ? 'inactive' : 'certification'}
                {...(cert ? { departmentCode: cert.departmentCode } : {})}
                rightSection={<CloseButton size="xs" onClick={() => onRemove(id)} />}
              >
                {cert ? `${cert.name}（${cert.shortName}）` : id}
              </AppBadge>
            );
          })}
        </Group>
      ) : (
        <Text c="dimmed" size="sm">
          割り当て済みの資格がありません
        </Text>
      )}

      {available.length > 0 && (
        <Select
          placeholder="資格を選択して追加"
          searchable
          data={available.map((cert) => ({
            value: cert.id,
            label: `${cert.name}（${cert.shortName}）`,
          }))}
          value={null}
          onChange={(value) => {
            if (value) onAdd(value);
          }}
        />
      )}
    </Stack>
  );
}

/** 保有資格のローカル編集状態（追加/除去）を管理するフック */
function usePendingCerts(initial: string[]) {
  const [pendingCertIds, setPendingCertIds] = useState<string[]>(initial);
  const add = (id: string) => setPendingCertIds((prev) => [...prev, id]);
  const remove = (id: string) => setPendingCertIds((prev) => prev.filter((x) => x !== id));
  return { pendingCertIds, add, remove };
}

/**
 * 作成モードのパネル。基本情報＋保有資格を1フォームで入力し、
 * 保存でインストラクター作成→資格割り当てまでまとめて実行する。
 */
function CreatePanel({ onClose }: { onClose: () => void }) {
  const form = useInstructorForm();
  const { pendingCertIds, add, remove } = usePendingCerts([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: allCerts } = useCertifications(false);
  const create = useCreateInstructor();
  const assign = useAssignCertification();

  const handleSave = async (values: InstructorFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const created = await create.mutateAsync({
        lastName: values.lastName,
        firstName: values.firstName,
        lastNameKana: values.lastNameKana || undefined,
        firstNameKana: values.firstNameKana || undefined,
        notes: values.notes || undefined,
      });
      for (const certificationId of pendingCertIds) {
        await assign.mutateAsync({ instructorId: created.id, certificationId });
      }
      notifications.show({
        color: 'green',
        message: `${created.lastName} ${created.firstName} を作成しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'インストラクターの作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <InstructorFormFields form={form} />
        <Divider />
        <CertEditor
          allCerts={allCerts}
          pendingCertIds={pendingCertIds}
          onAdd={add}
          onRemove={remove}
        />
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <FormFooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}

/** 編集対象の詳細を読み込み、揃うまで Skeleton を表示するローダー */
function EditPanel({ instructorId, onClose }: { instructorId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useInstructor(instructorId);
  const { data: allCerts } = useCertifications(false);

  if (isLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  return <EditForm key={detail.id} detail={detail} allCerts={allCerts} onClose={onClose} />;
}

type EditFormProps = {
  detail: InstructorWithCertifications;
  allCerts: Certification[] | undefined;
  onClose: () => void;
};

/**
 * 編集モードのフォーム。基本情報・保有資格・ステータスをローカルで編集し、
 * 保存で初期値との差分だけをまとめて API に反映する。
 */
function EditForm({ detail, allCerts, onClose }: EditFormProps) {
  const initialCertIds = detail.certifications.map((ic) => ic.certificationId);

  const form = useInstructorForm({
    lastName: detail.lastName,
    firstName: detail.firstName,
    lastNameKana: detail.lastNameKana ?? '',
    firstNameKana: detail.firstNameKana ?? '',
    notes: detail.notes ?? '',
  });
  const { pendingCertIds, add, remove } = usePendingCerts(initialCertIds);
  const [status, setStatus] = useState<InstructorStatus>(detail.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateInstructor(detail.id);
  const changeStatus = useChangeInstructorStatus(detail.id);
  const assign = useAssignCertification();
  const unassign = useUnassignCertification();

  const handleSave = async (values: InstructorFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];

      // 基本情報の差分
      const basicChanged =
        values.lastName !== detail.lastName ||
        values.firstName !== detail.firstName ||
        (values.lastNameKana || '') !== (detail.lastNameKana ?? '') ||
        (values.firstNameKana || '') !== (detail.firstNameKana ?? '') ||
        (values.notes || '') !== (detail.notes ?? '');
      if (basicChanged) {
        tasks.push(
          update.mutateAsync({
            lastName: values.lastName,
            firstName: values.firstName,
            lastNameKana: values.lastNameKana || null,
            firstNameKana: values.firstNameKana || null,
            notes: values.notes || null,
          }),
        );
      }

      // ステータスの差分
      if (status !== detail.status) {
        tasks.push(changeStatus.mutateAsync({ status }));
      }

      // 資格の差分（追加分は割り当て、除去分は解除）
      const initialSet = new Set(initialCertIds);
      const pendingSet = new Set(pendingCertIds);
      const added = pendingCertIds.filter((id) => !initialSet.has(id));
      const removed = initialCertIds.filter((id) => !pendingSet.has(id));
      for (const certificationId of added) {
        tasks.push(assign.mutateAsync({ instructorId: detail.id, certificationId }));
      }
      for (const certificationId of removed) {
        tasks.push(unassign.mutateAsync({ instructorId: detail.id, certificationId }));
      }

      await Promise.all(tasks);
      notifications.show({
        color: 'green',
        message: `${values.lastName} ${values.firstName} を保存しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'インストラクターの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const isActive = status === 'ACTIVE';

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <InstructorFormFields form={form} />

        <Divider />

        <CertEditor
          allCerts={allCerts}
          pendingCertIds={pendingCertIds}
          onAdd={add}
          onRemove={remove}
        />

        <Divider />

        <Group justify="space-between">
          <div>
            <Text fw={500} size="sm">
              ステータス
            </Text>
            <Text c="dimmed" size="xs">
              {isActive ? '有効' : '無効'}
            </Text>
          </div>
          <Switch
            checked={isActive}
            onChange={(e) => setStatus(e.currentTarget.checked ? 'ACTIVE' : 'INACTIVE')}
          />
        </Group>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <FormFooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
