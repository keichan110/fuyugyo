import { useEffect, useState } from 'react';

import {
  Alert,
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

import {
  useCreateShiftType,
  useDeactivateShiftType,
  useShiftType,
  useUpdateShiftType,
} from '../queries';
import type { ShiftType } from '../schema';
import { ShiftTypeFormFields } from './ShiftTypeForm';
import { useShiftTypeForm, type ShiftTypeFormValues } from './useShiftTypeForm';

/** Drawer が表示するモード（作成 or 特定シフト種別の編集） */
export type ShiftTypeDrawerState = { mode: 'create' } | { mode: 'edit'; shiftTypeId: string };

type Props = {
  state: ShiftTypeDrawerState | null;
  onClose: () => void;
};

/**
 * シフト種別の作成・編集・無効化を1つの右 Drawer にまとめたパネル。
 * 基本情報・ステータスを1フォームとして扱い、保存で一括反映・キャンセルで破棄する。
 */
export function ShiftTypeDrawer({ state, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<ShiftTypeDrawerState | null>(null);

  useEffect(() => {
    if (state) setLastState(state);
  }, [state]);

  const effectiveState = state ?? lastState;
  const isEdit = effectiveState?.mode === 'edit';

  return (
    <Drawer
      opened={state !== null}
      onClose={onClose}
      title={isEdit ? 'シフト種別を編集' : 'シフト種別を追加'}
    >
      {effectiveState?.mode === 'edit' ? (
        <EditPanel
          key={effectiveState.shiftTypeId}
          shiftTypeId={effectiveState.shiftTypeId}
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
 * 作成モードのパネル。種別名を入力し、保存でシフト種別を作成する。
 */
function CreatePanel({ onClose }: { onClose: () => void }) {
  const form = useShiftTypeForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateShiftType();

  const handleSave = async (values: ShiftTypeFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const created = await create.mutateAsync({ name: values.name });
      notifications.show({
        color: 'green',
        message: `${created.name}を作成しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'シフト種別の作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <ShiftTypeFormFields form={form} />
        {error && <Alert color="red">{error}</Alert>}
        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}

/** 編集対象の詳細を読み込み、揃うまで Skeleton を表示するローダー */
function EditPanel({ shiftTypeId, onClose }: { shiftTypeId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useShiftType(shiftTypeId);

  if (isLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
      </Stack>
    );
  }

  return <EditForm key={detail.id} detail={detail} onClose={onClose} />;
}

type EditFormProps = {
  detail: ShiftType;
  onClose: () => void;
};

/**
 * 編集モードのフォーム。種別名・ステータスをローカルで編集し、
 * 保存で初期値との差分だけをまとめて API に反映する。
 * API はステータスの無効化のみをサポートし再有効化はできないため、
 * すでに無効なシフト種別に対してはステータス操作 UI を出さない。
 */
function EditForm({ detail, onClose }: EditFormProps) {
  const form = useShiftTypeForm({ name: detail.name });
  const [active, setActive] = useState(detail.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateShiftType(detail.id);
  const deactivate = useDeactivateShiftType();

  const handleSave = async (values: ShiftTypeFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];

      if (values.name !== detail.name) {
        tasks.push(update.mutateAsync({ name: values.name }));
      }

      // 無効化は一方向の操作のため、アクティブ→無効の変化時のみ実行する
      if (detail.isActive && !active) {
        tasks.push(deactivate.mutateAsync(detail.id));
      }

      await Promise.all(tasks);
      notifications.show({
        color: 'green',
        message: `${values.name}を保存しました`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'シフト種別の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSave)}>
      <Stack gap="lg">
        <ShiftTypeFormFields form={form} />

        <Divider />

        {detail.isActive ? (
          <Stack gap={4}>
            <Group justify="space-between">
              <Text fw={500} size="sm">
                ステータス
              </Text>
              <Switch checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
            </Group>
            <Text c="dimmed" size="xs">
              無効化すると元に戻せません
            </Text>
          </Stack>
        ) : (
          <Stack gap={4}>
            <Text fw={500} size="sm">
              ステータス
            </Text>
            <Text c="dimmed" size="sm">
              無効（再有効化はできません）
            </Text>
          </Stack>
        )}

        {error && <Alert color="red">{error}</Alert>}

        <FooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
