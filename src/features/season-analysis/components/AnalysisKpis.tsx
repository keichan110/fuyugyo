import { Card, SimpleGrid, Stack, Text } from '@mantine/core';

import type { AnalysisView, FillRate } from '../aggregators';

function formatRate(fill: FillRate): string {
  return fill.rate === null ? '—' : `${Math.round(fill.rate)}%`;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card withBorder padding="md">
      <Stack gap={2}>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text fw={700} fz="xl">
          {value}
        </Text>
        {note && (
          <Text size="xs" c="dimmed">
            {note}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/** 概要 KPI。対象メンバー数・延べ勤務日数・平均・枠の充足率を並べる。 */
export function AnalysisKpis({ view }: { view: AnalysisView }) {
  const { fill, totals } = view;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
      <Kpi label="対象メンバー" value={`${view.members.length}名`} />
      <Kpi
        label="延べ勤務日数"
        value={`${totals.past + totals.future}日`}
        note={`実施済み ${totals.past}日 ／ 予定 ${totals.future}日`}
      />
      <Kpi label="1人あたり平均勤務日数" value={`${view.averageDays.toFixed(1)}日`} />
      <Kpi
        label="枠の充足率"
        value={`実施済み ${formatRate(fill.past)}`}
        note={`予定 ${formatRate(fill.future)}（必要人数ありの枠のみ）`}
      />
    </SimpleGrid>
  );
}
