import { Card, Group, Stack, Text } from '@mantine/core';

import type { ShiftViewItem } from '../schema';
import { addDays, shortDateLabel, weekdayIndex } from '../view-utils';

type WeeklyViewProps = {
  /** 週の開始日（YYYY-MM-DD） */
  dateFrom: string;
  shifts: ShiftViewItem[];
};

/** 土日の見出しを淡く色分けするための曜日別カラー */
function weekdayColor(dateStr: string): string | undefined {
  const day = weekdayIndex(dateStr);
  if (day === 0) {
    return 'red';
  }
  if (day === 6) {
    return 'blue';
  }
  return undefined;
}

/**
 * 週次ビュー: 開始日から7日間を日別カードの縦リストで表示する（モバイル可読）。
 * 各日のシフトを部門・種別・割り当て Instructor とともに並べる。
 */
export function WeeklyView({ dateFrom, shifts }: WeeklyViewProps) {
  // 日付（YYYY-MM-DD）→ その日のシフト配列にまとめる
  const byDate = new Map<string, ShiftViewItem[]>();
  for (const shift of shifts) {
    const list = byDate.get(shift.date) ?? [];
    list.push(shift);
    byDate.set(shift.date, list);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(dateFrom, i));

  return (
    <Stack gap="sm">
      {days.map((day) => {
        const dayShifts = byDate.get(day) ?? [];
        return (
          <Card key={day} withBorder padding="sm" radius="md">
            <Text size="sm" fw={500} c={weekdayColor(day) ?? 'inherit'}>
              {shortDateLabel(day)}
            </Text>
            {dayShifts.length === 0 ? (
              <Text c="dimmed" size="xs" mt={4}>
                シフトなし
              </Text>
            ) : (
              <Stack gap={6} mt="xs">
                {dayShifts.map((shift) => (
                  <Card key={shift.id} withBorder padding="xs" radius="sm" bg="gray.0">
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {shift.department.name}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {shift.shiftType.name}
                      </Text>
                    </Group>
                    {shift.assignedInstructors.length > 0 ? (
                      <Text c="dimmed" size="xs" mt={2}>
                        {shift.assignedInstructors.map((inst) => inst.displayName).join('、')}
                      </Text>
                    ) : (
                      <Text c="dimmed" size="xs" mt={2}>
                        割り当てなし
                      </Text>
                    )}
                    {shift.description && (
                      <Text c="dimmed" size="xs" mt={2}>
                        {shift.description}
                      </Text>
                    )}
                  </Card>
                ))}
              </Stack>
            )}
          </Card>
        );
      })}
    </Stack>
  );
}
