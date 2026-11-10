import {
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChartBar, IconChevronRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

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
        <Divider label="部門に紐づかない分析" labelPosition="center" />
        <UnstyledButton
          className={classes.choice}
          component={Link}
          to="/shifts/analysis"
          aria-label="シーズン分析を開く"
        >
          <Group gap="md" wrap="nowrap">
            <IconChartBar size={36} stroke={1.5} aria-hidden />
            <Stack gap={2} flex={1}>
              <Text fw={600} size="lg">
                シーズン分析
              </Text>
              <Text size="sm" c="dimmed">
                シーズンを通した配置の傾向を見る
              </Text>
            </Stack>
            <IconChevronRight size={18} aria-hidden />
          </Group>
        </UnstyledButton>
      </Stack>
    </Container>
  );
}
