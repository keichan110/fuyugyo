import { useMemo, useState } from 'react';

import { Card, Loader, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';

import { buildAnalysisView, type CountScope, type DepartmentFilter } from '../aggregators';
import { useSeasonAnalysis } from '../queries';
import { AnalysisFilterBar } from './AnalysisFilterBar';
import { AnalysisKpis } from './AnalysisKpis';
import { AvailabilityScatterChart } from './AvailabilityScatterChart';
import { MemberDaysChart } from './MemberDaysChart';
import { MemberMonthHeatmap } from './MemberMonthHeatmap';
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
  const view = useMemo(
    () =>
      data
        ? buildAnalysisView(data, { department: props.department, includeDrafts, countScope })
        : null,
    [data, props.department, includeDrafts, countScope],
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
          <Card withBorder padding="md">
            <WeeklyStaffingChart weeks={view.weeks} />
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
