import { Group, Progress, SimpleGrid, Stack, Text } from '@mantine/core';

import type { SeasonStatsSummary } from '@/features/shifts/schema';

/**
 * 差分を「+3日」「-2日」「±0日」の形式に整形する。
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

/** 昨季最終実績に対する到達状況を表示する。 */
function formatSeasonGoalLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff > 0) {
    return `昨季実績を${diff}日上回りました`;
  }
  if (diff === 0) {
    return '昨季実績に到達しました';
  }
  return `昨季実績まであと${Math.abs(diff)}日`;
}

/**
 * 今シーズンの勤務日数を主指標に、昨季同時点とのペース差と昨季最終実績への到達状況を表示する。
 * 今月の勤務日数と前月差は補助指標として併記する。
 * Issue #203 採用アイデア「今月/今シーズンの勤務日数サマリー」。
 */
export function SeasonWorkDaysSummary({ summary }: { summary: SeasonStatsSummary }) {
  const paceDiff = summary.currentSeasonWorkDays - summary.previousSeasonToDateWorkDays;
  const progress =
    summary.previousSeasonWorkDays === 0
      ? summary.currentSeasonWorkDays > 0
        ? 100
        : 0
      : Math.min((summary.currentSeasonWorkDays / summary.previousSeasonWorkDays) * 100, 100);
  const monthDiff = summary.currentMonthWorkDays - summary.previousMonthWorkDays;

  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xl">
      <Stack gap="md">
        <Stack gap={0}>
          <Text size="sm" c="dimmed">
            勤務日数
          </Text>
          <Text size="2rem" lh={1.2} fw={700}>
            {summary.currentSeasonWorkDays}日
          </Text>
          <Text size="sm" c={diffColor(paceDiff)}>
            昨季同時点より {formatDiffLabel(paceDiff)}
          </Text>
        </Stack>

        <Stack gap={4}>
          <Group justify="space-between" gap="xs">
            <Text size="sm">昨季実績 {summary.previousSeasonWorkDays}日</Text>
            <Text size="sm" c="dimmed">
              {summary.currentSeasonWorkDays} / {summary.previousSeasonWorkDays}日
            </Text>
          </Group>
          <Progress value={progress} aria-label="昨季実績に対する勤務日数の到達状況" />
          <Text size="sm" c="dimmed">
            {formatSeasonGoalLabel(summary.currentSeasonWorkDays, summary.previousSeasonWorkDays)}
          </Text>
        </Stack>
      </Stack>

      <Stack gap={0}>
        <Text size="sm" c="dimmed">
          今月
        </Text>
        <Group gap="xs" align="baseline">
          <Text size="xl" fw={700}>
            {summary.currentMonthWorkDays}日
          </Text>
          <Text size="sm" c={diffColor(monthDiff)}>
            前月より {formatDiffLabel(monthDiff)}
          </Text>
        </Group>
      </Stack>
    </SimpleGrid>
  );
}
