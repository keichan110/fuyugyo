import { Box } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import { ShiftAttendeeRow } from '@/features/shifts/components/ShiftAttendeeRow';
import type { ShiftViewItem } from '@/features/shifts/schema';

import classes from './DashboardShiftRow.module.css';

/**
 * ホームの勤務枠1行。部門色の左バーと担当者を表示し、自分が含まれる行は淡いブランド色で強調する。
 * インストラクター未連携（`instructorId` が null）の場合は強調しない。
 */
export function DashboardShiftRow({
  shift,
  instructorId,
}: {
  shift: ShiftViewItem;
  instructorId: string | null;
}) {
  const includesMe = shift.assignedInstructors.some((instructor) => instructor.id === instructorId);

  return (
    <Box className={classes.row} data-includes-me={includesMe || undefined}>
      <Box
        className={classes.departmentBar}
        bg={getDepartmentAppearance(shift.department.code, shift.department.name).color}
      />
      <ShiftAttendeeRow shift={shift} myInstructorId={instructorId} />
    </Box>
  );
}
