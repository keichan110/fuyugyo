import { useMemo } from 'react';

import { Grid } from '@mantine/core';

import type { AnalysisFilters, AnalysisView } from '../aggregators';
import { buildDependency } from '../dependency';
import type { SeasonAnalysis } from '../schema';
import { AnalysisBlock } from './AnalysisBlock';
import { AnalysisPanel } from './AnalysisPanel';
import { DependencySection } from './DependencySection';
import { WeeklyStaffingChart } from './WeeklyStaffingChart';

type Props = {
  data: SeasonAnalysis;
  filters: AnalysisFilters;
  view: AnalysisView;
};

/** 「枠・体制」ブロック。週ごとの充足状況と特定の人への依存を並べる。 */
export function StaffingBlock({ data, filters, view }: Props) {
  const dependency = useMemo(() => buildDependency(data, filters), [data, filters]);

  return (
    <AnalysisBlock title="枠・体制" question="枠が足りない時期や、特定の人への依存はないかを見る">
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="週ごとの充足状況"
            description="必要人数が設定された枠のみ集計。月曜始まり。"
          >
            {(expanded) => <WeeklyStaffingChart weeks={view.weeks} expanded={expanded} />}
          </AnalysisPanel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="特定の人への依存"
            description="担当回数は枠単位（同日に複数枠へ入ればそれぞれ1回）。ランクは各枠の必要資格のうち持つ最上位。"
          >
            {(expanded) => <DependencySection departments={dependency} expanded={expanded} />}
          </AnalysisPanel>
        </Grid.Col>
      </Grid>
    </AnalysisBlock>
  );
}
