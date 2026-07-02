import { useState } from 'react';

import { Alert, Button, Card, Group, Select, Stack, Text, Title } from '@mantine/core';

import { useLinkInstructor, useMe, useUnlinkInstructor } from '@/features/auth/queries';
import { useInstructor, useInstructors } from '@/features/instructors/queries';

/**
 * インストラクター連携パネル。ダッシュボードに配置し、
 * ユーザー本人が任意のアクティブ Instructor と自己サービスでリンク/解除できる
 * （信頼ベース・選択制限なし）。
 */
export function InstructorLinkPanel() {
  const { data: user } = useMe();
  const { data: instructors } = useInstructors();
  const { data: linkedInstructor } = useInstructor(user?.instructorId ?? '');
  const linkInstructor = useLinkInstructor();
  const unlinkInstructor = useUnlinkInstructor();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const instructorOptions = (instructors ?? []).map((instructor) => ({
    value: instructor.id,
    label: `${instructor.lastName} ${instructor.firstName}`,
  }));

  return (
    <Card withBorder padding="lg" radius="md">
      <Title order={3} size="h4" mb="sm">
        インストラクター連携
      </Title>

      {user.instructorId ? (
        <Group justify="space-between" align="center">
          <Text>
            {linkedInstructor
              ? `${linkedInstructor.lastName} ${linkedInstructor.firstName} さんとして連携中です`
              : '連携中です'}
          </Text>
          <Button
            type="button"
            variant="subtle"
            color="red"
            size="sm"
            loading={unlinkInstructor.isPending}
            onClick={() => unlinkInstructor.mutate()}
          >
            解除する
          </Button>
        </Group>
      ) : (
        <Stack gap="sm">
          <Text c="dimmed" size="sm">
            ご自身のインストラクターを選択して連携すると、直近の勤務予定が表示されます。
          </Text>
          <Group align="flex-end">
            <Select
              placeholder="インストラクターを選択"
              data={instructorOptions}
              searchable
              value={selectedId}
              onChange={setSelectedId}
              style={{ flex: 1 }}
            />
            <Button
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
            </Button>
          </Group>
          {linkInstructor.isError && <Alert color="red">{linkInstructor.error.message}</Alert>}
        </Stack>
      )}

      {unlinkInstructor.isError && (
        <Alert color="red" mt="sm">
          {unlinkInstructor.error.message}
        </Alert>
      )}
    </Card>
  );
}
