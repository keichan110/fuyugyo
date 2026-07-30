import { Group, Paper, Stack, Text } from '@mantine/core';
import { IconCalendarEvent } from '@tabler/icons-react';

import { AppButton } from '@/components/AppButton';

import classes from './DashboardAvailabilityLink.module.css';

/** 勤務予定の下に常設するシフト希望への通常導線。 */
export function DashboardAvailabilityLink() {
  return (
    <Paper withBorder radius="md" p="sm" mt="md">
      <Group className={classes.container} justify="space-between" gap="md" wrap="nowrap">
        <Group className={classes.description} gap="sm" wrap="nowrap" miw={0}>
          <IconCalendarEvent size={20} stroke={1.8} />
          <Stack gap={2} miw={0}>
            <Text fw={600}>シフト希望</Text>
            <Text className={classes.guidance} size="sm" c="dimmed">
              勤務できない日や調整が必要な日を登録します。
            </Text>
          </Stack>
        </Group>
        <AppButton
          className={classes.button}
          intent="secondary"
          component="a"
          href="/availabilities"
          size="sm"
        >
          シフト希望の確認・変更
        </AppButton>
      </Group>
    </Paper>
  );
}
