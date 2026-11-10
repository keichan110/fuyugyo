import { Box, ScrollArea, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

import { DEPARTMENT_LABELS } from '@/features/departments/schema';

import type { DepartmentFilter, MemberMonthCell, MemberSummary } from '../aggregators';
import classes from './MemberMonthHeatmap.module.css';

type Props = {
  members: MemberSummary[];
  months: string[];
  department: DepartmentFilter;
  /** 拡大表示中か（本文は常に全幅で人数分の行を持つため、現状は表示内容に影響しない） */
  expanded: boolean;
};

/** 月ごとの対象メンバー中央値との差を、多い=オレンジ・少ない=青の発散配色にする。0 は中立。 */
function cellBackground(diff: number, maxAbs: number): string | undefined {
  if (diff === 0) return undefined;
  const intensity = Math.round(Math.min(1, Math.abs(diff) / maxAbs) * 70) + 10;
  const color = diff > 0 ? 'var(--mantine-color-orange-6)' : 'var(--mantine-color-blue-6)';
  return `color-mix(in srgb, ${color} ${intensity}%, transparent)`;
}

/** B: 人×月の勤務日数。色は月ごとの中央値との差、予定のみの月は斜線で区別する。 */
export function MemberMonthHeatmap({ members, months, department }: Props) {
  const navigate = useNavigate();
  const maxAbs = Math.max(
    1,
    ...members.flatMap((member) => member.months.map((cell) => Math.abs(cell.diff))),
  );

  const openManage = (cell: MemberMonthCell) => {
    // 部門=全体のときは、その月に最も多く勤務した部門のシフト管理を開く
    const target = department === 'all' ? cell.topDepartment : department;
    if (target === null) return;
    void navigate({ to: '/shifts/manage', search: { department: target } });
  };

  return (
    <Stack gap="xs">
      <ScrollArea type="auto" offsetScrollbars>
        <Table withRowBorders={false} miw={Math.max(360, months.length * 56 + 140)}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={classes.nameCell}>メンバー</Table.Th>
              {months.map((month) => (
                <Table.Th key={month} ta="center">
                  {Number(month.slice(5))}月
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((member) => (
              <Table.Tr key={member.id}>
                <Table.Td className={classes.nameCell}>{member.name}</Table.Td>
                {member.months.map((cell) => {
                  const plannedOnly = cell.past === 0 && cell.future > 0;
                  const target = department === 'all' ? cell.topDepartment : department;
                  const label = `${member.name} ${cell.month} 勤務${cell.total}日（中央値との差 ${cell.diff > 0 ? '+' : ''}${cell.diff}）${plannedOnly ? '・予定のみ' : ''}`;
                  return (
                    <Table.Td key={cell.month} p={2}>
                      <UnstyledButton
                        className={classes.cell}
                        data-planned={plannedOnly || undefined}
                        style={{ backgroundColor: cellBackground(cell.diff, maxAbs) }}
                        disabled={target === null}
                        aria-label={`${label}。${
                          target === null ? '' : `${DEPARTMENT_LABELS[target]}のシフト管理を開く`
                        }`}
                        title={label}
                        onClick={() => openManage(cell)}
                      >
                        {cell.total}
                      </UnstyledButton>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Box>
        <Text size="xs" c="dimmed">
          セルの数値は勤務日数。色は同じ月の対象メンバー中央値との差（オレンジ=多い、青=少ない）。
          斜線は予定のみの月。クリックでシフト管理（部門）を開きます。
        </Text>
      </Box>
    </Stack>
  );
}
