import {
  IconAlertTriangleFilled,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleXFilled,
  IconHelpCircle,
  IconLoader,
} from '@tabler/icons-react';

import type { Availability } from '@/features/availabilities/schema';

import { availabilityDisplay, type AvailabilityDisplayStatus } from './availability-display';

const appearance = {
  AVAILABLE: { Icon: IconCircleCheck, color: 'var(--mantine-color-gray-6)' },
  AVOID: { Icon: IconAlertTriangleFilled, color: 'var(--mantine-color-yellow-8)' },
  UNAVAILABLE: { Icon: IconCircleXFilled, color: 'var(--mantine-color-red-6)' },
  NOT_ENTERED: { Icon: IconCircleDashed, color: 'var(--mantine-color-dimmed)' },
  LOADING: { Icon: IconLoader, color: 'var(--mantine-color-dimmed)' },
  ERROR: { Icon: IconHelpCircle, color: 'var(--mantine-color-dimmed)' },
} satisfies Record<AvailabilityDisplayStatus, unknown>;

/** 配置者の勤務可否を示す。通常状態は控えめにし、警告は形・色を保って表示する。 */
export function AssignedAvailabilityIcon({
  availability,
  ready,
  failed,
}: {
  availability: Availability | undefined;
  ready: boolean;
  failed: boolean;
}) {
  const { status, label } = availabilityDisplay(availability, ready, failed);
  const { Icon, color } = appearance[status];
  return (
    <Icon
      size={13}
      color={color}
      role="img"
      aria-label={label}
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    />
  );
}
