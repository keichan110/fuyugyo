import { useEffect, useState } from 'react';

import {
  Button,
  Divider,
  Drawer,
  Group,
  Skeleton,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert } from '@/components/AppAlert';
import { useDepartments } from '@/features/departments/queries';
import type { Department } from '@/features/departments/schema';

import {
  useCertification,
  useCreateCertification,
  useDeactivateCertification,
  useUpdateCertification,
} from '../queries';
import type { Certification } from '../schema';
import { CertificationFormFields } from './CertificationForm';
import { useCertificationForm, type CertificationFormValues } from './useCertificationForm';

/** Drawer が表示するモード（作成 or 特定資格の編集） */
export type CertificationDrawerState =
  { mode: 'create' } | { mode: 'edit'; certificationId: string };

type Props = {
  state: CertificationDrawerState | null;
  onClose: () => void;
};

/**
 * 資格の作成・編集・ステータス変更を1つの右 Drawer にまとめたパネル。
 * 基本情報とステータスを1フォームとして扱い、保存で一括反映・キャンセルで破棄する。
 */
export function CertificationDrawer({ state, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<CertificationDrawerState | null>(null);

  useEffect(() => {
    if (state) setLastState(state);
  }, [state]);

  const effectiveState = state ?? lastState;
  const isEdit = effectiveState?.mode === 'edit';

  return (
    <Drawer opened={state !== null} onClose={onClose} title={isEdit ? '資格を編集' : '資格を追加'}>
      {effectiveState?.mode === 'edit' ? (
        <EditPanel
          key={effectiveState.certificationId}
          certificationId={effectiveState.certificationId}
          onClose={onClose}
        />
      ) : (
        <CreatePanel onClose={onClose} />
      )}
    </Drawer>
  );
}

/** フォーム末尾のキャンセル・保存ボタン */
function FooterButtons({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <Group justify="flex-end">
      <Button variant="default" type="button" onClick={onCancel} disabled={saving}>
        キャンセル
      </Button>
      <Button type="submit" loading={saving}>
        保存
      </Button>
    </Group>
  );
}

/**
 * 作成モードのパネル。部門を選択のうえ基本情報を入力し、資格を作成する。
 */
function CreatePanel({ onClose }: { onClose: () => void }) {
  const form = useCertificationForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: departments } = useDepartments(true);
  const create = useCreateCertification();

  const handleSave = async (values: CertificationFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const created = await create.mutateAsync({
        departmentId: values.departmentId,
        name: values.name,
        shortName: values.shortName,
        organization: values.organization,
        description: values.description || undefined,
      });
      notifications.show({
        color: 'green',
        message: `${created.name}を作成しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '資格の作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <CertificationFormFields form={form} departments={departments} />
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}

/** 編集対象の詳細を読み込み、揃うまで Skeleton を表示するローダー */
function EditPanel({ certificationId, onClose }: { certificationId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useCertification(certificationId);
  // 部門名表示用（無効化済みの部門も含めて解決できるよう全件取得する）
  const { data: departments } = useDepartments(false);

  if (isLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  return <EditForm key={detail.id} detail={detail} departments={departments} onClose={onClose} />;
}

type EditFormProps = {
  detail: Certification;
  departments: Department[] | undefined;
  onClose: () => void;
};

/**
 * 編集モードのフォーム。部門は変更不可のため読み取り専用表示にし、
 * 基本情報とステータスをローカルで編集して初期値との差分だけを API に反映する。
 * ステータスは無効化のみ対応し、一度無効化すると再有効化はできない。
 */
function EditForm({ detail, departments, onClose }: EditFormProps) {
  const form = useCertificationForm({
    departmentId: detail.departmentId,
    name: detail.name,
    shortName: detail.shortName,
    organization: detail.organization,
    description: detail.description ?? '',
  });
  const [isActive, setIsActive] = useState(detail.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateCertification(detail.id);
  const deactivate = useDeactivateCertification();

  const departmentName = departments?.find((d) => d.id === detail.departmentId)?.name ?? '—';

  const handleSave = async (values: CertificationFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const basicChanged =
        values.name !== detail.name ||
        values.shortName !== detail.shortName ||
        values.organization !== detail.organization ||
        (values.description || '') !== (detail.description ?? '');
      if (basicChanged) {
        await update.mutateAsync({
          name: values.name,
          shortName: values.shortName,
          organization: values.organization,
          description: values.description || null,
        });
      }

      // 無効化は一方向の操作のため、アクティブ→無効の変化のときのみ実行する
      if (detail.isActive && !isActive) {
        await deactivate.mutateAsync(detail.id);
      }

      notifications.show({
        color: 'green',
        message: `${values.name}を保存しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '資格の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <CertificationFormFields form={form} departmentName={departmentName} />

        <Divider />

        <div>
          <Text fw={500} size="sm">
            ステータス
          </Text>
          {detail.isActive ? (
            <>
              <Group justify="space-between" mt="xs">
                <Text size="sm">{isActive ? 'アクティブ' : '無効にする'}</Text>
                <Switch checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} />
              </Group>
              <Text c="dimmed" size="xs" mt={4}>
                無効化すると元に戻せません
              </Text>
            </>
          ) : (
            <Text c="dimmed" size="sm" mt="xs">
              無効（再有効化はできません）
            </Text>
          )}
        </div>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
