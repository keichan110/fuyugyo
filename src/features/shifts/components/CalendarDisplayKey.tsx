import { Box, Group, Popover, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

import { AppButton } from '@/components/AppButton';
import type { Availability } from '@/features/availabilities/schema';

import { AssignedAvailabilityIcon } from './AssignedAvailabilityIcon';
import { staffingBackground } from './staffing-appearance';

const statuses: { type: Availability['type']; label: string }[] = [
  { type: 'AVAILABLE', label: '勤務可' },
  { type: 'AVOID', label: '要調整' },
  { type: 'UNAVAILABLE', label: '勤務不可' },
];

/** カレンダーの補助的な凡例は必要なときだけ、色見本とアイコンで表示する。 */
export function CalendarDisplayKey() {
  return (
    <Popover position="bottom-end" withArrow shadow="sm">
      <Popover.Target>
        <AppButton intent="tertiary" size="compact-xs" px={6} aria-label="表示の見方">
          <IconInfoCircle size={16} aria-hidden />
          <Text component="span" visibleFrom="sm" ml={5} size="xs">
            表示の見方
          </Text>
        </AppButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <SimpleGrid cols={2} spacing="xs">
            {[
              { label: '不足', required: 2, assigned: 0 },
              { label: '充足', required: 2, assigned: 2 },
              { label: '過員', required: 2, assigned: 3 },
              { label: '未設定', required: null, assigned: 0 },
            ].map((item) => (
              <Group key={item.label} gap={6}>
                <Box
                  w={16}
                  h={16}
                  bg={staffingBackground(item.required, item.assigned)}
                  style={{ border: '1px solid var(--mantine-color-default-border)' }}
                />
                <Text size="xs">{item.label}</Text>
              </Group>
            ))}
            <Group gap={6}>
              <Box w={16} h={16} style={{ border: '1px solid var(--mantine-color-teal-3)' }} />
              <Text size="xs">公開済み</Text>
            </Group>
            <Group gap={6}>
              <Box w={16} h={16} bg="gray.1" />
              <Text size="xs">対象月外・選択解除</Text>
            </Group>
          </SimpleGrid>
          <SimpleGrid cols={2} spacing="xs">
            {statuses.map((item) => (
              <Group key={item.type} gap={6}>
                <AssignedAvailabilityIcon
                  availability={{ type: item.type, instructorId: '', date: '', note: null }}
                  ready
                  failed={false}
                />
                <Text size="xs">{item.label}</Text>
              </Group>
            ))}
            <Group gap={6}>
              <AssignedAvailabilityIcon availability={undefined} ready failed={false} />
              <Text size="xs">未入力</Text>
            </Group>
          </SimpleGrid>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
