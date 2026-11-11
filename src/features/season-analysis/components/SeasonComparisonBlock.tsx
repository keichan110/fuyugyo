import { useMemo } from 'react';

import { Grid, Stack, Text } from '@mantine/core';

import { seasonName } from '@/features/shifts/season';

import type { AnalysisFilters } from '../aggregators';
import { buildComparison, comparisonPeriodLabel, type ComparisonView } from '../comparison';
import type { SeasonAnalysis } from '../schema';
import { AnalysisBlock } from './AnalysisBlock';
import { AnalysisPanel } from './AnalysisPanel';
import {
  ComparisonMemberChart,
  ComparisonMonthlyChart,
  ComparisonSummary,
} from './SeasonComparisonSection';

type Props = {
  data: SeasonAnalysis;
  /** 前シーズンのデータ。未取得なら undefined */
  previousData: SeasonAnalysis | undefined;
  /** 前シーズンのデータを読み込み中か */
  previousPending: boolean;
  filters: AnalysisFilters;
  /** 選択中のシーズン開始年 */
  season: number;
};

/**
 * 「前シーズンとの比較」ブロック。
 * 前シーズンの取得は今シーズンと並列に始めたいため、画面本体で行った結果を受け取る。
 */
export function SeasonComparisonBlock({
  data,
  previousData,
  previousPending,
  filters,
  season,
}: Props) {
  const comparison = useMemo(
    () => (previousData ? buildComparison(data, previousData, filters) : null),
    [data, previousData, filters],
  );

  return (
    <AnalysisBlock title="前シーズンとの比較" question="前シーズンからどう変わったかを見る">
      {comparison === null || comparison.previousIsEmpty ? (
        <Text size="sm" c="dimmed">
          {comparison === null && previousPending
            ? '前シーズンのデータを読み込んでいます。'
            : '前シーズンのデータがありません'}
        </Text>
      ) : (
        <ComparisonPanels comparison={comparison} season={season} />
      )}
    </AnalysisBlock>
  );
}

/** 比較データがあるときの要約と2つのパネル */
function ComparisonPanels({ comparison, season }: { comparison: ComparisonView; season: number }) {
  return (
    <Stack gap="sm">
      <ComparisonSummary view={comparison} season={season} />
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="月別の延べ勤務日数"
            description="前シーズンは全期間を表示します。今シーズンの今後の月は予定と見比べてください。"
          >
            {(expanded) => (
              <ComparisonMonthlyChart view={comparison} season={season} expanded={expanded} />
            )}
          </AnalysisPanel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="メンバー別の増減"
            description={`${seasonName(season)} − ${seasonName(season - 1)}（${comparisonPeriodLabel(comparison)}）。「新規」は前シーズンに配置がない人。今シーズンに配置がない人は減少として表示します。`}
          >
            {(expanded) => <ComparisonMemberChart view={comparison} expanded={expanded} />}
          </AnalysisPanel>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
