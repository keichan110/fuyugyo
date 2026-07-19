import { Group, Modal, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import { ShiftTypeFormFields } from '@/features/shift-types/components/ShiftTypeForm';
import {
  useShiftTypeForm,
  type ShiftTypeFormValues,
} from '@/features/shift-types/components/useShiftTypeForm';

import { useCreateDepartmentShiftType } from '../queries';

/**
 * シフト種別マスタを登録し、指定部門へ続けて割り当てる入力Dialog。
 * 登録後の種別IDを親へ渡し、必要資格の編集対象へすぐ切り替えられるようにする。
 */
export function CreateDepartmentShiftTypeDialog({
  opened,
  departmentCode,
  onClose,
  onCreated,
}: {
  opened: boolean;
  departmentCode: DepartmentCode;
  onClose: () => void;
  onCreated: (shiftTypeId: string) => void;
}) {
  const form = useShiftTypeForm();
  const create = useCreateDepartmentShiftType(departmentCode);

  const close = () => {
    if (create.isPending) return;
    form.reset();
    onClose();
  };

  const handleSubmit = async (values: ShiftTypeFormValues) => {
    try {
      const createdShiftTypes = await create.mutateAsync({ name: values.name });
      const created = createdShiftTypes.at(-1);
      if (!created) throw new Error('登録したシフト種別を取得できませんでした');

      notifications.show({
        color: 'green',
        message: `${created.name}を登録し、${DEPARTMENT_LABELS[departmentCode]}部門に追加しました`,
      });
      form.reset();
      onCreated(created.shiftTypeId);
    } catch {
      // エラーはDialog内で表示するため、ここでは状態更新のみを行う。
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="シフト種別を登録して追加" centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          <ShiftTypeFormFields form={form} />
          {create.isError && <ErrorAlert>{create.error.message}</ErrorAlert>}
          <Group justify="flex-end">
            <AppButton intent="secondary" type="button" onClick={close} disabled={create.isPending}>
              キャンセル
            </AppButton>
            <AppButton intent="primary" type="submit" loading={create.isPending}>
              登録して{DEPARTMENT_LABELS[departmentCode]}部門に追加
            </AppButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
