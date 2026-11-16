import { useState } from 'react';

import { AppButton } from '@/components/AppButton';
import { useMyAvailabilities } from '@/features/availabilities/queries';

import { getAvailabilityReminderMonth } from '../availability-reminder';
import {
  DashboardNotificationInbox,
  type DashboardNotification,
} from './DashboardNotificationInbox';

type DashboardNotificationsProps = {
  instructorId: string | null;
};

/**
 * 現在のユーザーに必要な通知を集め、受信箱として表示する。
 * 各通知は配列へ追加するだけで増やせるよう、表示条件と一覧UIを分離している。
 */
export function DashboardNotifications({ instructorId }: DashboardNotificationsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const month = getAvailabilityReminderMonth();
  const availabilityQuery = useMyAvailabilities(month, Boolean(instructorId));

  const notifications: DashboardNotification[] = [];

  if (
    instructorId &&
    !availabilityQuery.isLoading &&
    !availabilityQuery.isError &&
    availabilityQuery.data?.availabilities.length === 0
  ) {
    const monthNumber = Number(month.slice(5));
    notifications.push({
      id: `availability-${month}`,
      level: 'info',
      title: `${monthNumber}月分のシフト希望を確認してください`,
      description: '勤務できない日や調整が必要な日があれば、登録してください。',
      action: (
        <AppButton
          intent="secondary"
          size="xs"
          component="a"
          href={`/availabilities?month=${month}`}
        >
          {monthNumber}月分を確認
        </AppButton>
      ),
    });
  }

  const visibleNotifications = notifications.filter(
    (notification) => !dismissedIds.has(notification.id),
  );

  return (
    <>
      <DashboardNotificationInbox
        notifications={visibleNotifications}
        onDismiss={(id) => setDismissedIds((current) => new Set(current).add(id))}
      />
    </>
  );
}
