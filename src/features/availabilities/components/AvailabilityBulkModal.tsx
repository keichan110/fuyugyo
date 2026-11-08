import { useMemo, useState } from 'react';

import { Checkbox, Group, Modal, Stack, Text } from '@mantine/core';

import { AppButton } from '@/components/AppButton';
import { WEEKDAY_LABELS } from '@/features/shifts/view-utils';

import { planBulkAvailability, type BulkCategory, type StagedAvailability } from '../editor';
import type { Availability } from '../schema';
import { AvailabilityTypeSelect } from './AvailabilityTypeSelect';

/** チェックボックスの表示順（月曜始まり＋祝）。 */
const CATEGORY_OPTIONS: { value: BulkCategory; label: string }[] = [
  ...[1, 2, 3, 4, 5, 6, 0].map((index) => ({
    value: index,
    label: WEEKDAY_LABELS[index] ?? '',
  })),
  { value: 'holiday', label: '祝' },
];

type Props = {
  opened: boolean;
  onClose: () => void;
  month: string;
  today: string;
  lockedDates: ReadonlySet<string>;
  getCurrent: (date: string) => StagedAvailability | undefined;
  /** 適用対象の日付と状態を親へ渡す。 */
  onApply: (targetDates: string[], type: Availability['type']) => void;
};

/** 表示中の月に対し、曜日・祝日単位で勤務可否をまとめて設定するモーダル。 */
export function AvailabilityBulkModal({ opened, onClose, ...rest }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="一括設定" centered>
      <BulkForm onClose={onClose} {...rest} />
    </Modal>
  );
}

/** モーダルを閉じるたびに破棄されるため、開き直すと初期状態になる。 */
function BulkForm({
  onClose,
  month,
  today,
  lockedDates,
  getCurrent,
  onApply,
}: Omit<Props, 'opened'>) {
  const [selected, setSelected] = useState<BulkCategory[]>([]);
  const [type, setType] = useState<Availability['type'] | null>(null);

  const plan = useMemo(
    () =>
      type
        ? planBulkAvailability({
            month,
            categories: new Set(selected),
            type,
            today,
            lockedDates,
            getCurrent,
          })
        : null,
    [month, selected, type, today, lockedDates, getCurrent],
  );
  const excludedTotal = plan ? plan.excluded.past + plan.excluded.locked : 0;
  const excludedReasons = plan
    ? [
        plan.excluded.past > 0 ? `過去日 ${plan.excluded.past}` : null,
        plan.excluded.locked > 0 ? `公開済みシフト ${plan.excluded.locked}` : null,
      ].filter((reason) => reason !== null)
    : [];
  const canApply = plan !== null && type !== null && plan.targetDates.length > 0;

  return (
    <Stack>
      <Stack gap={4}>
        <Checkbox.Group
          label="曜日・祝日"
          value={selected.map(String)}
          onChange={(values) =>
            setSelected(
              CATEGORY_OPTIONS.map((option) => option.value).filter((value) =>
                values.includes(String(value)),
              ),
            )
          }
        >
          <Group gap="sm" mt={4}>
            {CATEGORY_OPTIONS.map((option) => (
              <Checkbox key={option.value} value={String(option.value)} label={option.label} />
            ))}
          </Group>
        </Checkbox.Group>
        <Text size="xs" c="dimmed">
          祝日（振替休日を含む）は曜日に含まれません。祝日に適用する場合は「祝」を選んでください。
        </Text>
      </Stack>
      <AvailabilityTypeSelect value={type} onChange={setType} />
      <Text size="xs" c="dimmed">
        メモは変更されません。
      </Text>
      {plan && selected.length > 0 && (
        <Stack gap={2}>
          <Text size="sm">
            対象 {plan.targetDates.length}日
            {plan.overwriteCount > 0 && `（既存の希望を上書き ${plan.overwriteCount}日）`}
          </Text>
          {excludedTotal > 0 && (
            <Text size="sm" c="dimmed">
              変更できない日 {excludedTotal}日（{excludedReasons.join('・')}）
            </Text>
          )}
        </Stack>
      )}
      <Group justify="flex-end">
        <AppButton intent="secondary" onClick={onClose}>
          キャンセル
        </AppButton>
        <AppButton
          intent="primary"
          disabled={!canApply}
          onClick={() => {
            if (!plan || !type) return;
            onApply(plan.targetDates, type);
            onClose();
          }}
        >
          適用
        </AppButton>
      </Group>
    </Stack>
  );
}
