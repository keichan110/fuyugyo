import { CompositeChart } from '@mantine/charts';
import { Box, ScrollArea, Stack, Text } from '@mantine/core';

import { shortDateLabel } from '@/features/shifts/view-utils';

import type { WeeklyStaffing } from '../aggregators';
import { PANEL_CHART_HEIGHT } from './AnalysisPanel';

const PHASE_SUFFIX: Record<WeeklyStaffing['phase'], string> = {
  past: '',
  current: '（今週）',
  future: '（予定）',
};

/** D: 週ごとの必要人数合計と配置人数合計、不足枠数。予定の週はラベルで区別する。 */
export function WeeklyStaffingChart({
  weeks,
  expanded,
}: {
  weeks: WeeklyStaffing[];
  expanded: boolean;
}) {
  const data = weeks.map((week) => ({
    week: `${shortDateLabel(week.weekStart)}〜${PHASE_SUFFIX[week.phase]}`,
    required: week.required,
    assigned: week.assigned,
    shortageSlots: week.shortageSlots,
  }));
  return (
    <Stack gap="xs">
      {weeks.length === 0 ? (
        <Text size="sm" c="dimmed">
          必要人数が設定された枠がありません。
        </Text>
      ) : (
        <ScrollArea type="auto" offsetScrollbars>
          <Box miw={Math.max(360, weeks.length * 48)}>
            <CompositeChart
              h={expanded ? 480 : PANEL_CHART_HEIGHT}
              data={data}
              dataKey="week"
              withLegend
              withRightYAxis
              rightYAxisLabel="不足枠数"
              yAxisLabel="人数"
              yAxisProps={{ allowDecimals: false }}
              rightYAxisProps={{ allowDecimals: false }}
              xAxisProps={{ interval: 0, angle: -45, textAnchor: 'end', height: 60 }}
              series={[
                { name: 'required', type: 'bar', color: 'gray.5', label: '必要人数' },
                { name: 'assigned', type: 'bar', color: 'teal.6', label: '配置人数' },
                {
                  name: 'shortageSlots',
                  type: 'line',
                  color: 'red.6',
                  label: '不足枠数',
                  yAxisId: 'right',
                },
              ]}
              aria-label="週ごとの必要人数と配置人数、不足枠数"
            />
          </Box>
        </ScrollArea>
      )}
    </Stack>
  );
}
