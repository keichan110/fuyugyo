import { useState } from 'react';

import { Group, Modal, Stack, Textarea } from '@mantine/core';

import { AppButton } from '@/components/AppButton';
import { parseDate, WEEKDAY_LABELS } from '@/features/shifts/view-utils';

import type { StagedAvailability } from '../editor';
import type { Availability } from '../schema';
import { AvailabilityTypeSelect } from './AvailabilityTypeSelect';

/** 「M月D日（曜）」形式の日付ラベルを返す。 */
function formatTitleDate(date: string): string {
  const d = parseDate(date);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAY_LABELS[d.getUTCDay()]}）`;
}

type Props = {
  /** 編集対象の日付。null のとき閉じる。 */
  date: string | null;
  current: StagedAvailability | undefined;
  onClose: () => void;
  onSubmit: (date: string, value: StagedAvailability) => void;
};

/** 1日分の勤務可否とメモを編集するモーダル。 */
export function AvailabilityDayModal({ date, current, onClose, onSubmit }: Props) {
  return (
    <Modal
      opened={date !== null}
      onClose={onClose}
      title={date ? `${formatTitleDate(date)}の希望` : ''}
      centered
    >
      {date && <DayForm date={date} current={current} onClose={onClose} onSubmit={onSubmit} />}
    </Modal>
  );
}

/** 開くたびに現在値で初期化されるフォーム。 */
function DayForm({
  date,
  current,
  onClose,
  onSubmit,
}: {
  date: string;
  current: StagedAvailability | undefined;
  onClose: () => void;
  onSubmit: (date: string, value: StagedAvailability) => void;
}) {
  const [type, setType] = useState<Availability['type'] | null>(current?.type ?? null);
  const [note, setNote] = useState(current?.note ?? '');

  return (
    <Stack>
      <AvailabilityTypeSelect value={type} onChange={setType} />
      <Textarea
        label="メモ"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        maxLength={500}
        autosize
        minRows={3}
      />
      <Group justify="flex-end">
        <AppButton intent="secondary" onClick={onClose}>
          キャンセル
        </AppButton>
        <AppButton
          intent="primary"
          disabled={type === null}
          onClick={() => {
            if (type === null) return;
            onSubmit(date, { type, note: note.trim() || null });
            onClose();
          }}
        >
          反映
        </AppButton>
      </Group>
    </Stack>
  );
}
