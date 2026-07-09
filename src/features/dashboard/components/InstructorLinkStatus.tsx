import { Button, Group, Text } from '@mantine/core';

import { useMe, useUnlinkInstructor } from '@/features/auth/queries';
import { useInstructor } from '@/features/instructors/queries';

/**
 * 連携済み時に画面下部へ表示する最小限の連携ステータス。
 * 連携＝推奨・正常状態のため目立たせず、解除操作も極薄グレーに留める。
 */
export function InstructorLinkStatus() {
  const { data: user } = useMe();
  const { data: linkedInstructor } = useInstructor(user?.instructorId ?? '');
  const unlinkInstructor = useUnlinkInstructor();

  return (
    <Group justify="center" gap="xs">
      <Text size="xs" c="dimmed">
        {linkedInstructor
          ? `${linkedInstructor.lastName} ${linkedInstructor.firstName} さんとして連携中`
          : '連携中'}
      </Text>
      <Text size="xs" c="dimmed">
        ·
      </Text>
      <Button
        type="button"
        variant="subtle"
        color="gray"
        size="compact-xs"
        loading={unlinkInstructor.isPending}
        onClick={() => unlinkInstructor.mutate()}
      >
        解除
      </Button>
      {unlinkInstructor.isError && (
        <Text c="red" size="xs">
          {unlinkInstructor.error.message}
        </Text>
      )}
    </Group>
  );
}
