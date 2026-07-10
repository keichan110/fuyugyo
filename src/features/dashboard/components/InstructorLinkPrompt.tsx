import { useState } from 'react';

import { Alert, Button, Card, Group, Select, Stack, Text } from '@mantine/core';

import { useLinkInstructor } from '@/features/auth/queries';
import { useInstructors } from '@/features/instructors/queries';

/**
 * インストラクター未連携時にダッシュボード上部へ表示する連携フォーム。
 * 他パネルと同じ枠（Card）の中に warning（メッセージのみ）と Select/Button をまとめる
 * （黄色背景の Alert 内に白背景の入力コントロールを直接置くと違和感があるため分離）。
 */
export function InstructorLinkPrompt() {
  const { data: instructors } = useInstructors();
  const linkInstructor = useLinkInstructor();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const instructorOptions = (instructors ?? []).map((instructor) => ({
    value: instructor.id,
    label: `${instructor.lastName} ${instructor.firstName}`,
  }));

  return (
    <Card padding="lg">
      <Stack gap="md">
        <Alert color="yellow" variant="light" title="インストラクターと連携してください">
          連携すると、すべての機能が使えるようになります。
        </Alert>
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
        {linkInstructor.isError && (
          <Text c="red" size="sm">
            {linkInstructor.error.message}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
