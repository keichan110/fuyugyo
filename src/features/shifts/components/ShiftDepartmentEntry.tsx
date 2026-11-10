import { Container, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import classes from './ShiftDepartmentEntry.module.css';

/** シフト管理の入口で担当部門を明示的に選ぶ。編集状態は選択後の画面だけで保持する。 */
export function ShiftDepartmentEntry({
  onSelect,
}: {
  onSelect: (department: DepartmentCode) => void;
}) {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Stack gap={6} align="center">
          <Title order={2}>シフト管理</Title>
          <Text c="dimmed" size="sm">
            担当する部門を選択してください
          </Text>
        </Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {departmentCodeSchema.options.map((code) => {
            const { label, icon: Icon } = getDepartmentAppearance(code);
            return (
              <UnstyledButton
                key={code}
                className={classes.choice}
                onClick={() => onSelect(code)}
                aria-label={`${label}のシフト管理を開く`}
              >
                <Group gap="md" wrap="nowrap">
                  <Icon size={36} stroke={1.5} aria-hidden />
                  <Text fw={600} size="lg" flex={1}>
                    {label}
                  </Text>
                  <IconChevronRight size={18} aria-hidden />
                </Group>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
