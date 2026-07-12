import { ActionIcon, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import { ShiftTypeList } from '@/features/shift-types/components/ShiftTypeList';
import type { ShiftTypeListItem } from '@/features/shift-types/schema';

import { useDepartmentShiftTypes, useUpdateDepartmentShiftTypes } from '../queries';

/** 共有シフト種別マスタから、指定部門で利用する種別を選ぶパネル。 */
export function DepartmentShiftTypeCatalog({ departmentCode }: { departmentCode: DepartmentCode }) {
  const { data: departmentShiftTypes } = useDepartmentShiftTypes(departmentCode);
  const update = useUpdateDepartmentShiftTypes(departmentCode);
  const assignedShiftTypeIds = new Set(
    (departmentShiftTypes ?? []).map((shiftType) => shiftType.shiftTypeId),
  );

  const assignShiftType = (shiftType: ShiftTypeListItem) => {
    if (assignedShiftTypeIds.has(shiftType.id)) return;
    update.mutate(
      {
        shiftTypeIds: [
          ...(departmentShiftTypes ?? []).map(
            (departmentShiftType) => departmentShiftType.shiftTypeId,
          ),
          shiftType.id,
        ],
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: `${shiftType.name}を${DEPARTMENT_LABELS[departmentCode]}部門で利用できるようにしました`,
          });
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <ShiftTypeList
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
              disabled={isDisabled || update.isPending}
              loading={update.isPending}
              onClick={() => assignShiftType(shiftType)}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
          );
        }}
      />
      {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
    </Stack>
  );
}
