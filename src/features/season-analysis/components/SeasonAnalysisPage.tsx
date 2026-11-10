import { useMemo, useState } from 'react';

import { Card, Loader, Stack, Text } from '@mantine/core';

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
          <Card withBorder padding="md">
            <MemberDaysChart members={view.members} averageDays={view.averageDays} />
          </Card>
          <Card withBorder padding="md">
            <AvailabilityScatterChart members={view.members} workRatio={view.workRatio} />
          </Card>
          <Card withBorder padding="md">
            <MemberMonthHeatmap
              members={view.members}
              months={view.months}
              department={props.department}
            />
          </Card>
          {consecutive && (
            <Card withBorder padding="md">
              <ConsecutiveWorkSection view={consecutive} />
            </Card>
          )}
          <Card withBorder padding="md">
            <WeeklyStaffingChart weeks={view.weeks} />
          </Card>
          {dependency && (
            <Card withBorder padding="md">
              <DependencySection departments={dependency} />
            </Card>
          )}
          <Card withBorder padding="md">
            <SeasonComparisonSection
              view={comparison}
              season={props.season}
              isLoading={previousQuery.isPending}
            />
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
