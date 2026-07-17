import { useEffect, useState } from 'react';

import { Divider, Drawer, Group, Skeleton, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert } from '@/components/AppAlert';
import { FormFooterButtons } from '@/components/FormFooterButtons';

import { useCreateShiftType, useShiftType, useShiftTypes, useUpdateShiftType } from '../queries';
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
 * シフト種別の作成・編集・有効状態の変更を1つの右 Drawer にまとめたパネル。
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
      title={isEdit ? 'シフト種別を編集' : 'シフト種別を新規登録'}
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

/** 親Drawer内で一覧から遷移して表示するシフト種別フォーム。 */
export function ShiftTypeDrawerContent({
  state,
  onDone,
}: {
  state: ShiftTypeDrawerState;
  onDone: () => void;
}) {
  return state.mode === 'edit' ? (
    <EditPanel shiftTypeId={state.shiftTypeId} onClose={onDone} />
  ) : (
    <CreatePanel onClose={onDone} />
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
        message: `${created.name}をマスタに登録しました`,
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
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <FormFooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}

/** 編集対象の詳細を読み込み、揃うまで Skeleton を表示するローダー */
function EditPanel({ shiftTypeId, onClose }: { shiftTypeId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useShiftType(shiftTypeId);
  const { data: shiftTypes } = useShiftTypes(false);

  if (isLoading || !detail) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
      </Stack>
    );
  }

  const availableDepartmentCount = shiftTypes?.find((shiftType) => shiftType.id === detail.id)
    ?.availableDepartmentCodes.length;

  return (
    <EditForm
      key={detail.id}
      detail={detail}
      availableDepartmentCount={availableDepartmentCount}
      onClose={onClose}
    />
  );
}

type EditFormProps = {
  detail: ShiftType;
  availableDepartmentCount: number | undefined;
  onClose: () => void;
};

/**
 * 編集モードのフォーム。種別名・ステータスをローカルで編集し、
 * 保存で初期値との差分だけをまとめて API に反映する。
 * 有効・無効の切り替えは可逆であり、無効化による影響は保存前に表示する。
 */
function EditForm({ detail, availableDepartmentCount, onClose }: EditFormProps) {
  const form = useShiftTypeForm({ name: detail.name });
  const [active, setActive] = useState(detail.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateShiftType(detail.id);

  const handleSave = async (values: ShiftTypeFormValues) => {
    setSaving(true);
    setError(null);
    try {
      if (values.name !== detail.name || active !== detail.isActive) {
        await update.mutateAsync({ name: values.name, isActive: active });
      }
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

        <Stack gap={4}>
          <Group justify="space-between">
            <Text fw={500} size="sm">
              状態
            </Text>
            <Switch
              checked={active}
              label={active ? '有効' : '無効'}
              onChange={(e) => setActive(e.currentTarget.checked)}
            />
          </Group>
          <Text c="dimmed" size="xs">
            {availableDepartmentCount === undefined
              ? '利用部門を確認中です。'
              : `現在${availableDepartmentCount}部門で利用されています。`}
          </Text>
          {detail.isActive && !active && (
            <Text c="dimmed" size="xs">
              無効にすると、すべての部門で新規のシフト入力には使えなくなります。既存のシフトと部門への割り当ては保持されます。
            </Text>
          )}
        </Stack>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <FormFooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
