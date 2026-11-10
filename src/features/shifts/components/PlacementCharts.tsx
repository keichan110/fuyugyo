import { BarChart } from '@mantine/charts';
import { Box, Group, RingProgress, ScrollArea, Stack, Text } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import { departmentCodeSchema } from '@/features/departments/schema';

import type { FrameComposition } from '../qualification-composition';
import type { WorkEntry } from '../workload';
import { staffingRate } from './staffing-appearance';
import { weeklyPlacementData } from './weekly-placement-data';

/** 選択枠の充足率を示す。過員は100%で切り捨てず中央の数値で伝える。 */
export function StaffingRateChart({
  required,
  assigned,
}: {
  required: number | null;
  assigned: number;
}) {
  const rate = staffingRate(required, assigned);
  if (rate === null || required === null) return null;
  const label =
    rate < 100
      ? `不足 ${required - assigned}名`
      : rate > 100
        ? `過員 ${assigned - required}名`
        : '充足';
  return (
    <Group
      gap="md"
      role="img"
      aria-label={`充足率${Math.round(rate)}%、配置${assigned}名、必要${required}名、${label}`}
    >
      <RingProgress
        size={120}
        thickness={12}
        sections={[
          {
            value: Math.min(100, rate),
            color: rate < 100 ? 'orange.6' : rate > 100 ? 'yellow.7' : 'teal.6',
          },
        ]}
        label={
          <Text ta="center" fw={700}>
            {Math.round(rate)}%
          </Text>
        }
      />
      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <Text size="sm">
          配置 {assigned} / 必要 {required}名
        </Text>
      </Stack>
    </Group>
  );
}

/** 各人を最上位の該当資格で1回だけ数え、資格構成を比較する。ランク別の必要人数は定義しない。 */
export function QualificationChart({ composition }: { composition: FrameComposition }) {
  const data = composition.rankBreakdown.map((rank) => ({
    qualification: rank.certificationNames.join('・'),
    count: rank.count,
  }));
  if (composition.outOfRequirementNames.length > 0) {
    data.push({ qualification: '要件外', count: composition.outOfRequirementNames.length });
  }
  if (composition.assignedCount === 0 || data.length === 0) return null;
  return (
    <BarChart
      h={Math.max(150, data.length * 45)}
      data={data}
      dataKey="qualification"
      orientation="vertical"
      series={[{ name: 'count', color: 'indigo.6', label: '配置人数' }]}
      xAxisProps={{ allowDecimals: false }}
      yAxisProps={{ width: 100 }}
      withBarValueLabel
      valueFormatter={(value) => `${value}名`}
      aria-label="資格ランク別の配置人数。各人は最上位の該当資格で1回だけ集計"
    />
  );
}

/** タイムラインと同じ3分類で、週ごとの勤務の集中を可視化する。 */
export function WeeklyPlacementChart({
  days,
  monthWork,
  current,
}: {
  days: readonly string[];
  monthWork: ReadonlyMap<string, readonly WorkEntry[]>;
  current: { departmentCode: string; shiftTypeId: string };
}) {
  const otherDepartmentCode = departmentCodeSchema.options.find(
    (code) => code !== current.departmentCode,
  );
  const otherDepartmentColor = getDepartmentAppearance(otherDepartmentCode ?? '').color;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        週ごとの勤務日数
      </Text>
      <ScrollArea type="auto" offsetScrollbars>
        <Box miw={360}>
          <BarChart
            h={250}
            data={weeklyPlacementData(days, monthWork, current)}
            dataKey="week"
            series={[
              { name: 'current', color: 'teal.6', label: '表示中の部門・種別' },
              { name: 'sameDepartmentOtherType', color: 'teal.3', label: '同部門の別種別' },
              { name: 'otherDepartment', color: otherDepartmentColor, label: '別部門（部門色）' },
            ]}
            withLegend
            legendProps={{ itemSorter: null }}
            xAxisProps={{
              interval: 0,
              tickFormatter: (value) => String(value).split('（')[0] ?? '',
            }}
            yAxisProps={{ domain: [0, 7], allowDecimals: false }}
            valueFormatter={(value) => `${value}日`}
            aria-label="週別勤務日数。表示中の部門・種別、同部門の別種別、別部門の3分類"
          />
        </Box>
      </ScrollArea>
      <Text size="xs" c="dimmed">
        月曜始まり・当月内・同日は各分類で1日
      </Text>
    </Stack>
  );
}
