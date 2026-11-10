import { useMemo, useState } from 'react';

import { Grid, Loader, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';

import {
  buildAnalysisView,
  type AnalysisFilters,
  type CountScope,
  type DepartmentFilter,
} from '../aggregators';
import { buildComparison } from '../comparison';
import { buildConsecutive } from '../consecutive';
import { buildDependency } from '../dependency';
import { useSeasonAnalysis } from '../queries';
import { AnalysisFilterBar } from './AnalysisFilterBar';
import { AnalysisKpis } from './AnalysisKpis';
import { AnalysisPanel } from './AnalysisPanel';
import { AvailabilityScatterChart } from './AvailabilityScatterChart';
import { ConsecutiveWorkSection } from './ConsecutiveWorkSection';
import { DependencySection } from './DependencySection';
import { MemberDaysChart } from './MemberDaysChart';
import { MemberMonthHeatmap } from './MemberMonthHeatmap';
import { SeasonComparisonSection } from './SeasonComparisonSection';
import { WeeklyStaffingChart } from './WeeklyStaffingChart';

type Props = {
  season: number;
  onSeasonChange: (season: number) => void;
  department: DepartmentFilter;
  onDepartmentChange: (department: DepartmentFilter) => void;
};

/** シーズン分析の画面本体。season・department は URL、その他のフィルタは画面内の状態で持つ。 */
export function SeasonAnalysisPage(props: Props) {
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [countScope, setCountScope] = useState<CountScope>('allDepartments');
  const query = useSeasonAnalysis(props.season);
  const data = query.data;
  const previousQuery = useSeasonAnalysis(props.season - 1);
  const previousData = previousQuery.data;
  const filters = useMemo<AnalysisFilters>(
    () => ({ department: props.department, includeDrafts, countScope }),
    [props.department, includeDrafts, countScope],
  );
  const view = useMemo(() => (data ? buildAnalysisView(data, filters) : null), [data, filters]);
  const consecutive = useMemo(
    () => (data ? buildConsecutive(data, filters) : null),
    [data, filters],
  );
  const dependency = useMemo(() => (data ? buildDependency(data, filters) : null), [data, filters]);
  const comparison = useMemo(
    () => (data && previousData ? buildComparison(data, previousData, filters) : null),
    [data, previousData, filters],
  );

  return (
    <Stack gap="lg">
      <AnalysisFilterBar
        today={data?.today ?? new Date().toISOString().slice(0, 10)}
        season={props.season}
        onSeasonChange={props.onSeasonChange}
        department={props.department}
        onDepartmentChange={props.onDepartmentChange}
        includeDrafts={includeDrafts}
        onIncludeDraftsChange={setIncludeDrafts}
        countScope={props.department === 'all' ? 'allDepartments' : countScope}
        onCountScopeChange={setCountScope}
      />
      {query.isPending && <Loader size="sm" aria-label="読み込み中" />}
      {query.isError && <ErrorAlert>{query.error.message}</ErrorAlert>}
      {view && view.members.length === 0 && (
        <Text c="dimmed">このシーズンの対象メンバーがいません。</Text>
      )}
      {view && view.members.length > 0 && (
        <Stack gap="lg">
          <AnalysisKpis view={view} />
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AnalysisPanel title="メンバー別の勤務日数">
                {(expanded) => (
                  <MemberDaysChart
                    members={view.members}
                    averageDays={view.averageDays}
                    expanded={expanded}
                  />
                )}
              </AnalysisPanel>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AnalysisPanel title="勤務可能日数と勤務日数">
                {(expanded) => (
                  <AvailabilityScatterChart
                    members={view.members}
                    workRatio={view.workRatio}
                    expanded={expanded}
                  />
                )}
              </AnalysisPanel>
            </Grid.Col>
            {/* 人×月は横に長いため常に全幅 */}
            <Grid.Col span={12}>
              <AnalysisPanel title="人×月の勤務日数">
                {(expanded) => (
                  <MemberMonthHeatmap
                    members={view.members}
                    months={view.months}
                    department={props.department}
                    expanded={expanded}
                  />
                )}
              </AnalysisPanel>
            </Grid.Col>
            {consecutive && (
              <Grid.Col span={{ base: 12, md: 6 }}>
                <AnalysisPanel title="連勤">
                  {(expanded) => <ConsecutiveWorkSection view={consecutive} expanded={expanded} />}
                </AnalysisPanel>
              </Grid.Col>
            )}
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AnalysisPanel
                title="週ごとの充足状況"
                description="必要人数が設定された枠のみ集計。月曜始まり。"
              >
                {(expanded) => <WeeklyStaffingChart weeks={view.weeks} expanded={expanded} />}
              </AnalysisPanel>
            </Grid.Col>
            {dependency && (
              <Grid.Col span={{ base: 12, md: 6 }}>
                <AnalysisPanel
                  title="特定の人への依存"
                  description="担当回数は枠単位（同日に複数枠へ入ればそれぞれ1回）。ランクは各枠の必要資格のうち持つ最上位。"
                >
                  {(expanded) => <DependencySection departments={dependency} expanded={expanded} />}
                </AnalysisPanel>
              </Grid.Col>
            )}
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AnalysisPanel title="前シーズンとの比較">
                {(expanded) => (
                  <SeasonComparisonSection
                    view={comparison}
                    season={props.season}
                    isLoading={previousQuery.isPending}
                    expanded={expanded}
                  />
                )}
              </AnalysisPanel>
            </Grid.Col>
          </Grid>
        </Stack>
      )}
    </Stack>
  );
}
