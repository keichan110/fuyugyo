import { Group, Select, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
} from '@tabler/icons-react';

import type { Availability } from '../schema';
import {
  AVAILABILITY_DESCRIPTIONS,
  AVAILABILITY_SELECT_DATA,
  isAvailabilityType,
} from './availability-options';

/** 状態ごとのアイコン。カレンダー上の表示と同じ形・色に揃える。 */
const TYPE_ICONS = {
  AVAILABLE: { Icon: IconCircleCheckFilled, color: 'var(--mantine-color-green-6)' },
  AVOID: { Icon: IconAlertTriangleFilled, color: 'var(--mantine-color-yellow-8)' },
  UNAVAILABLE: { Icon: IconCircleXFilled, color: 'var(--mantine-color-red-6)' },
} satisfies Record<Availability['type'], unknown>;

/** 状態に対応するアイコン。 */
function TypeIcon({ type }: { type: Availability['type'] }) {
  const { Icon, color } = TYPE_ICONS[type];
  return <Icon size={18} color={color} aria-hidden />;
}

/** 勤務可・要調整・勤務不可をアイコン付きで選ぶ Select。未入力は選べない。 */
export function AvailabilityTypeSelect({
  value,
  onChange,
}: {
  value: Availability['type'] | null;
  onChange: (value: Availability['type'] | null) => void;
}) {
  return (
    <Select
      label="状態"
      placeholder="選択してください"
      data={AVAILABILITY_SELECT_DATA}
      value={value}
      onChange={(next) => onChange(next && isAvailabilityType(next) ? next : null)}
      allowDeselect={false}
      leftSection={value ? <TypeIcon type={value} /> : undefined}
      renderOption={({ option }) =>
        isAvailabilityType(option.value) ? (
          <Group gap="xs" wrap="nowrap">
            <TypeIcon type={option.value} />
            <Stack gap={0}>
              <Text size="sm">{option.label}</Text>
              <Text size="xs" c="dimmed">
                {AVAILABILITY_DESCRIPTIONS[option.value]}
              </Text>
            </Stack>
          </Group>
        ) : (
          option.label
        )
      }
      comboboxProps={{ withinPortal: true }}
    />
  );
}
