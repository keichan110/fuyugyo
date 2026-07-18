import { Card, Group, Stack, Text, Title } from '@mantine/core';

import type { SeasonStatsSummary } from '@/features/shifts/schema';

/**
 * 差分（前月・前シーズン比）を「+3日」「-2日」「±0日」の形式に整形する。
 * @param diff - 今期の値から前期の値を引いた差分
 */
function formatDiffLabel(diff: number): string {
  if (diff === 0) {
    return '±0日';
  }
  return diff > 0 ? `+${diff}日` : `${diff}日`;
}

/** 差分の正負に応じたテキスト色（増加=teal、減少=red、変化なし=dimmed） */
function diffColor(diff: number): string {
  if (diff === 0) {
    return 'dimmed';
  }
  return diff > 0 ? 'teal' : 'red';
}

/** 今月/今シーズンの勤務日数と、前月/前シーズンとの差分を表示する1ブロック */
function WorkDaysStat({
  label,
  workDays,
  diff,
}: {
  label: string;
  workDays: number;
  diff: number;
}) {
  return (
    <Stack gap={0}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Group gap="xs" align="baseline">
        <Text size="xl" fw={700}>
          {workDays}日
        </Text>
        <Text size="sm" c={diffColor(diff)}>
          {formatDiffLabel(diff)}
        </Text>
      </Group>
    </Stack>
  );
}

/**
 * 今シーズンの勤務日数サマリーカード（今月/今シーズンの勤務日数と前月/前シーズン比）。
 * Issue #203 採用アイデア「今月/今シーズンの勤務日数サマリー」。
 */
export function SeasonWorkDaysSummary({ summary }: { summary: SeasonStatsSummary }) {
  return (
    <Card padding="lg">
      <Title order={3} size="h4" mb="sm">
        今シーズンの勤務日数
      </Title>
      <Group gap="xl">
        <WorkDaysStat
          label="今月"
          workDays={summary.currentMonthWorkDays}
          diff={summary.currentMonthWorkDays - summary.previousMonthWorkDays}
        />
        <WorkDaysStat
          label="今シーズン"
          workDays={summary.currentSeasonWorkDays}
          diff={summary.currentSeasonWorkDays - summary.previousSeasonWorkDays}
        />
      </Group>
    </Card>
  );
}
