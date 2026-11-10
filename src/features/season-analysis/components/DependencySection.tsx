import { BarChart } from '@mantine/charts';
import { Card, SimpleGrid, Stack, Text } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';

import { TOP_SHARE_MEMBER_COUNT, type DepartmentDependency } from '../dependency';

/** グラフに個別表示するメンバー数。残りは「ほか n名」にまとめる */
const CHART_MEMBER_LIMIT = 10;

function DepartmentDependencyBlock({
  dependency,
  showHeading,
  expanded,
}: {
  dependency: DepartmentDependency;
  showHeading: boolean;
  expanded: boolean;
}) {
  const appearance = getDepartmentAppearance(dependency.departmentCode);
  const top = dependency.members.slice(0, CHART_MEMBER_LIMIT);
  const rest = dependency.members.slice(CHART_MEMBER_LIMIT);
  const data = [
    ...top.map((member) => ({ name: member.name, count: member.count })),
    ...(rest.length > 0
      ? [
          {
            name: `ほか ${rest.length}名`,
            count: rest.reduce((sum, member) => sum + member.count, 0),
          },
        ]
      : []),
  ];
  return (
    <Stack gap="sm">
      {showHeading && (
        <Text size="sm" fw={600} c={appearance.color}>
          {appearance.label}
        </Text>
      )}
      {!dependency.hasTiers ? (
        <Text size="sm" c="dimmed">
          必要資格が設定されていません
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
          {dependency.ranks.map((rank) => (
            <Card key={rank.tierRank ?? 'none'} withBorder padding="sm">
              <Stack gap={2}>
                <Text size="sm" fw={600}>
                  {rank.label}
                </Text>
                <Text size="xs" c="dimmed">
                  担当 {rank.memberCount}名 ／ {rank.assignmentCount}回
                </Text>
                <Text size="sm">
                  上位{TOP_SHARE_MEMBER_COUNT}名の占有率{' '}
                  {rank.topShare === null ? '—' : `${Math.round(rank.topShare * 100)}%`}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
      {data.length > 0 && (
        <BarChart
          h={Math.max(expanded ? 240 : 200, data.length * 28 + 60)}
          data={data}
          dataKey="name"
          orientation="vertical"
          series={[{ name: 'count', color: appearance.color, label: '担当回数' }]}
          xAxisProps={{ allowDecimals: false }}
          yAxisProps={{ width: 96 }}
          valueFormatter={(value) => `${value}回`}
          aria-label={`${appearance.label}のメンバー別担当回数`}
        />
      )}
      {dependency.assignmentCount === 0 && (
        <Text size="sm" c="dimmed">
          配置がありません。
        </Text>
      )}
    </Stack>
  );
}

/** E: 特定の人への依存。資格ランクごとの占有率と、メンバー別の担当回数（枠単位）を部門ごとに示す。 */
export function DependencySection({
  departments,
  expanded,
}: {
  departments: DepartmentDependency[];
  expanded: boolean;
}) {
  return (
    <Stack gap="md">
      {departments.map((dependency) => (
        <DepartmentDependencyBlock
          key={dependency.departmentCode}
          dependency={dependency}
          showHeading={departments.length > 1}
          expanded={expanded}
        />
      ))}
    </Stack>
  );
}
