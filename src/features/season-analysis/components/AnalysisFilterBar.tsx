import { Group, SegmentedControl, Select, Stack, Switch, Text, Title } from '@mantine/core';

import { DEPARTMENT_LABELS, departmentCodeSchema } from '@/features/departments/schema';

import type { CountScope, DepartmentFilter } from '../aggregators';
import { seasonOptions } from '../season-label';

type Props = {
  today: string;
  season: number;
  onSeasonChange: (season: number) => void;
  department: DepartmentFilter;
  onDepartmentChange: (department: DepartmentFilter) => void;
  includeDrafts: boolean;
  onIncludeDraftsChange: (value: boolean) => void;
  countScope: CountScope;
  onCountScopeChange: (value: CountScope) => void;
};

const DEPARTMENT_DATA = [
  { value: 'all', label: '全体' },
  ...departmentCodeSchema.options.map((code) => ({ value: code, label: DEPARTMENT_LABELS[code] })),
];

/** 画面上部のタイトルとフィルタ群。season と department は呼び出し側が URL に保持する。 */
export function AnalysisFilterBar(props: Props) {
  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Title order={2}>シーズン分析</Title>
        <Text size="xs" c="dimmed">
          配置を実績とみなして集計しています
        </Text>
      </Stack>
      <Group align="flex-end" gap="md">
        <Select
          label="シーズン"
          allowDeselect={false}
          data={seasonOptions(props.today, props.season)}
          value={String(props.season)}
          onChange={(value) => {
            if (value !== null) props.onSeasonChange(Number(value));
          }}
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            部門
          </Text>
          <SegmentedControl
            data={DEPARTMENT_DATA}
            value={props.department}
            onChange={(value) => {
              const parsed = departmentCodeSchema.safeParse(value);
              props.onDepartmentChange(parsed.success ? parsed.data : 'all');
            }}
          />
        </Stack>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            負荷の数え方
          </Text>
          <SegmentedControl
            data={[
              { value: 'allDepartments', label: '全部門で数える' },
              { value: 'selectedDepartment', label: '選択部門のみで数える' },
            ]}
            value={props.countScope}
            disabled={props.department === 'all'}
            onChange={(value) =>
              props.onCountScopeChange(value === 'selectedDepartment' ? value : 'allDepartments')
            }
          />
        </Stack>
        <Switch
          label="未公開（下書き）を含む"
          checked={props.includeDrafts}
          onChange={(event) => props.onIncludeDraftsChange(event.currentTarget.checked)}
        />
      </Group>
    </Stack>
  );
}
