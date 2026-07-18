import { Fragment } from 'react';

import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconMessage, IconUserFilled } from '@tabler/icons-react';

import { getDepartmentAppearance } from '@/features/departments/appearance';

import type { ShiftViewItem } from '../schema';
import classes from './ShiftAttendeeRow.module.css';

/**
 * 1シフト分の出勤者行（部門アイコン＋シフト種別名＋割り当て済みインストラクター名、自分は強調）。
 * シフト表アジェンダとダッシュボードの出勤状況セクションで共有する。
 */
export function ShiftAttendeeRow({
  shift,
  myInstructorId,
}: {
  shift: ShiftViewItem;
  myInstructorId: string | null;
}) {
  const department = getDepartmentAppearance(shift.department.code, shift.department.name);
  const DepartmentIcon = department.icon;

  return (
    <Stack gap={4} className={classes.eventDetails}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <ThemeIcon color={department.color} variant="transparent" size="sm">
            <DepartmentIcon size={18} stroke={1.75} />
          </ThemeIcon>
          <Text fw={600}>{shift.shiftType.name}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {shift.assignedInstructors.length}名
        </Text>
      </Group>
      {shift.assignedInstructors.length > 0 ? (
        <Group gap={4} align="flex-start" wrap="nowrap">
          <ThemeIcon color="gray" variant="transparent" size={16} mt={3}>
            <IconUserFilled size={14} />
          </ThemeIcon>
          <Text size="sm" className={classes.assignedInstructorList}>
            {shift.assignedInstructors.map((instructor) => (
              <Fragment key={instructor.id}>
                <Text component="span" fw={instructor.id === myInstructorId ? 600 : 400}>
                  {instructor.displayName}
                </Text>
                {instructor.id !== shift.assignedInstructors.at(-1)?.id && ' ・ '}
              </Fragment>
            ))}
          </Text>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          未割り当て
        </Text>
      )}
      {shift.description && (
        <Group gap={4} align="flex-start" wrap="nowrap">
          <ThemeIcon color="gray.6" variant="transparent" size={16} mt={1}>
            <IconMessage size={14} stroke={1.75} />
          </ThemeIcon>
          <Text size="xs" c="dimmed" className={classes.descriptionText}>
            {shift.description}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
