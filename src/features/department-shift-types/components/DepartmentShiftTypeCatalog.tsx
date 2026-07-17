import { ActionIcon, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import {
  ShiftTypeList,
  type ShiftTypeDrawerState,
  type ShiftTypeListItem,
} from '@/features/shift-types';

import { useAssignDepartmentShiftType, useDepartmentShiftTypes } from '../queries';

/** 共有シフト種別マスタから、指定部門で利用する種別を選ぶパネル。 */
export function DepartmentShiftTypeCatalog({
  departmentCode,
  onOpenForm,
}: {
  departmentCode: DepartmentCode;
  onOpenForm?: (state: ShiftTypeDrawerState) => void;
}) {
  const { data: departmentShiftTypes } = useDepartmentShiftTypes(departmentCode);
  const assign = useAssignDepartmentShiftType(departmentCode);
  const assignedShiftTypeIds = new Set(
    (departmentShiftTypes ?? []).map((shiftType) => shiftType.shiftTypeId),
  );

  const assignShiftType = (shiftType: ShiftTypeListItem) => {
    if (!departmentShiftTypes || assignedShiftTypeIds.has(shiftType.id)) return;
    assign.mutate(shiftType.id, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: `${shiftType.name}を${DEPARTMENT_LABELS[departmentCode]}部門で利用できるようにしました`,
        });
      },
    });
  };

  return (
    <Stack gap="md">
      <ShiftTypeList
        {...(onOpenForm ? { onOpenForm } : {})}
        rowActionHeader=""
        renderRowAction={(shiftType) => {
          const isAssigned = assignedShiftTypeIds.has(shiftType.id);
          const isDisabled = isAssigned || !shiftType.isActive;
          return (
            <ActionIcon
              aria-label={
                isAssigned
                  ? `${shiftType.name}は${DEPARTMENT_LABELS[departmentCode]}部門で利用中`
                  : !shiftType.isActive
                    ? `${shiftType.name}は無効のため追加できません`
                    : `${shiftType.name}を${DEPARTMENT_LABELS[departmentCode]}部門で利用する`
              }
              variant="subtle"
              disabled={isDisabled || !departmentShiftTypes || assign.isPending}
              loading={assign.isPending}
              onClick={() => assignShiftType(shiftType)}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
          );
        }}
      />
      {assign.isError && <ErrorAlert>{assign.error.message}</ErrorAlert>}
    </Stack>
  );
}
