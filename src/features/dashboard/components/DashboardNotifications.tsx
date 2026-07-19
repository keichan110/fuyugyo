import { useState } from 'react';

import { Group, Modal, Select, Stack, Text } from '@mantine/core';

import { AppButton } from '@/components/AppButton';
import { useLinkInstructor } from '@/features/auth/queries';
import { useMyAvailabilities } from '@/features/availabilities/queries';
import { useInstructors } from '@/features/instructors/queries';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkModalOpened, setLinkModalOpened] = useState(false);
  const month = getAvailabilityReminderMonth();
  const availabilityQuery = useMyAvailabilities(month, Boolean(instructorId));
  const { data: instructors } = useInstructors();
  const linkInstructor = useLinkInstructor();

  const instructorOptions = (instructors ?? []).map((instructor) => ({
    value: instructor.id,
    label: `${instructor.lastName} ${instructor.firstName}`,
  }));

  const notifications: DashboardNotification[] = [];

  if (!instructorId) {
    notifications.push({
      id: 'instructor-link',
      level: 'warn',
      title: 'インストラクターと連携してください',
      description: '連携すると、すべての機能が使えるようになります。',
      action: (
        <AppButton
          intent="secondary"
          size="xs"
          type="button"
          onClick={() => setLinkModalOpened(true)}
        >
          連携する
        </AppButton>
      ),
    });
  }

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

      <Modal
        opened={linkModalOpened}
        onClose={() => setLinkModalOpened(false)}
        title="インストラクターと連携"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            あなた自身のインストラクターを選択してください。
          </Text>
          <Group align="flex-end">
            <Select
              label="インストラクター"
              placeholder="インストラクターを選択"
              data={instructorOptions}
              searchable
              value={selectedId}
              onChange={setSelectedId}
              flex={1}
            />
            <AppButton
              intent="primary"
              type="button"
              disabled={!selectedId}
              loading={linkInstructor.isPending}
              onClick={() => {
                if (selectedId) {
                  linkInstructor.mutate({ instructorId: selectedId });
                }
              }}
            >
              連携する
            </AppButton>
          </Group>
          {linkInstructor.isError && (
            <Text c="red" size="sm">
              {linkInstructor.error.message}
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
