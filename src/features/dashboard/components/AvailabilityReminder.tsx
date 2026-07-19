import { useState } from 'react';

import { Group, Text } from '@mantine/core';
import { IconCalendarExclamation } from '@tabler/icons-react';

import { InfoAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { useMyAvailabilities } from '@/features/availabilities/queries';

import { getNextJstMonth, shouldShowAvailabilityReminder } from '../availability-reminder';

/** 来月の勤務不可・回避希望が未入力のときに表示する、控えめな確認案内。 */
export function AvailabilityReminder() {
  const [isVisible, setIsVisible] = useState(true);
  const isReminderPeriod = shouldShowAvailabilityReminder();
  const month = getNextJstMonth();
  const availabilityQuery = useMyAvailabilities(month, isReminderPeriod);

  if (!isReminderPeriod || !isVisible || availabilityQuery.isLoading) {
    return null;
  }

  if (availabilityQuery.isError || availabilityQuery.data?.availabilities.length !== 0) {
    return null;
  }

  return (
    <InfoAlert
      title={`${Number(month.slice(5))}月分のシフト希望を確認してください`}
      icon={<IconCalendarExclamation />}
      withCloseButton
      closeButtonLabel="シフト希望の確認案内を閉じる"
      onClose={() => setIsVisible(false)}
    >
      <Group justify="space-between" align="center">
        <Text size="sm">勤務できない日や調整が必要な日があれば、登録してください。</Text>
        <AppButton intent="secondary" component="a" href={`/availabilities?month=${month}`}>
          {Number(month.slice(5))}月分を確認
        </AppButton>
      </Group>
    </InfoAlert>
  );
}
