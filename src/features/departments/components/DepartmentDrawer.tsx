import { useEffect, useState } from 'react';

import { Button, Drawer, Group, Skeleton, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert } from '@/components/AppAlert';

import {
  useCreateDepartment,
  useDeactivateDepartment,
  useDepartment,
  useUpdateDepartment,
} from '../queries';
import type { Department } from '../schema';
import { DepartmentFormFields } from './DepartmentForm';
import { useDepartmentForm, type DepartmentFormValues } from './useDepartmentForm';

/** Drawer が表示するモード（作成 or 特定部門の編集） */
export type DepartmentDrawerState = { mode: 'create' } | { mode: 'edit'; departmentId: string };

type Props = {
  state: DepartmentDrawerState | null;
  onClose: () => void;
};

/**
 * 部門の作成・編集・無効化を1つの右 Drawer にまとめたパネル。
 */
export function DepartmentDrawer({ state, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<DepartmentDrawerState | null>(null);

  useEffect(() => {
    if (state) setLastState(state);
  }, [state]);

  const effectiveState = state ?? lastState;
  const isEdit = effectiveState?.mode === 'edit';

  return (
    <Drawer opened={state !== null} onClose={onClose} title={isEdit ? '部門を編集' : '部門を追加'}>
      {effectiveState?.mode === 'edit' ? (
        <EditPanel
          key={effectiveState.departmentId}
          departmentId={effectiveState.departmentId}
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
 * 作成モードのパネル。コード・部門名・説明を入力し、部門を新規作成する。
 */
function CreatePanel({ onClose }: { onClose: () => void }) {
  const form = useDepartmentForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateDepartment();

  const handleSave = async (values: DepartmentFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const created = await create.mutateAsync({
        code: values.code,
        name: values.name,
        description: values.description || undefined,
      });
      notifications.show({
        color: 'green',
        message: `${created.name}を作成しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '部門の作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <DepartmentFormFields form={form} />
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}

/** 編集対象の詳細を読み込み、揃うまで Skeleton を表示するローダー */
function EditPanel({ departmentId, onClose }: { departmentId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useDepartment(departmentId);

  if (isLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  return <EditForm key={detail.id} detail={detail} onClose={onClose} />;
}

type EditFormProps = {
  detail: Department;
  onClose: () => void;
};

/**
 * 編集モードのフォーム。部門名・説明をローカルで編集し、
 * 保存で初期値との差分だけをまとめて API に反映する。
 * コードは作成後変更できない仕様のため、フォーム上は disabled 表示のみで送信対象に含めない。
 */
function EditForm({ detail, onClose }: EditFormProps) {
  const form = useDepartmentForm({
    code: detail.code,
    name: detail.name,
    description: detail.description ?? '',
  });
  // 無効化 API は一方向（アクティブ→無効）のみ提供されるため、
  // 既に無効な部門は Switch を出さず、アクティブな部門のみ OFF 操作を受け付ける
  const [staysActive, setStaysActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateDepartment(detail.id);
  const deactivate = useDeactivateDepartment();

  const handleSave = async (values: DepartmentFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];

      // 基本情報の差分
      const basicChanged =
        values.name !== detail.name || (values.description || '') !== (detail.description ?? '');
      if (basicChanged) {
        tasks.push(
          update.mutateAsync({
            name: values.name,
            description: values.description || null,
          }),
        );
      }

      // ステータスの差分（無効化は一方向のみ）
      if (detail.isActive && !staysActive) {
        tasks.push(deactivate.mutateAsync(detail.id));
      }

      await Promise.all(tasks);
      notifications.show({
        color: 'green',
        message: `${values.name}を保存しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '部門の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <DepartmentFormFields form={form} codeDisabled />

        <Group justify="space-between">
          <div>
            <Text fw={500} size="sm">
              ステータス
            </Text>
            {detail.isActive ? (
              <Text c="dimmed" size="xs">
                無効化すると元に戻せません
              </Text>
            ) : (
              <Text c="dimmed" size="xs">
                無効（再有効化はできません）
              </Text>
            )}
          </div>
          {detail.isActive && (
            <Switch
              checked={staysActive}
              onChange={(e) => setStaysActive(e.currentTarget.checked)}
            />
          )}
        </Group>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
