import { useMemo, useState } from 'react';

import { Loader, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';

import { buildAnalysisView, type AnalysisFilters, type DepartmentFilter } from '../aggregators';
import { useSeasonAnalysis } from '../queries';
import { AnalysisFilterBar } from './AnalysisFilterBar';
import { AnalysisKpis } from './AnalysisKpis';
import { PeopleBiasBlock } from './PeopleBiasBlock';
import { SeasonComparisonBlock } from './SeasonComparisonBlock';
import { StaffingBlock } from './StaffingBlock';

type Props = {
  season: number;
  onSeasonChange: (season: number) => void;
  department: DepartmentFilter;
  onDepartmentChange: (department: DepartmentFilter) => void;
};

/** シーズン分析の画面本体。season・department は URL、その他のフィルタは画面内の状態で持つ。 */
export function SeasonAnalysisPage(props: Props) {
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const query = useSeasonAnalysis(props.season);
  const data = query.data;
  // 前シーズンは比較ブロックでしか使わないが、今シーズンと並列に取得を始めるためここで呼ぶ
  const previousQuery = useSeasonAnalysis(props.season - 1);
  const filters = useMemo<AnalysisFilters>(
    () => ({ department: props.department, includeDrafts }),
    [props.department, includeDrafts],
  );
  const view = useMemo(() => (data ? buildAnalysisView(data, filters) : null), [data, filters]);

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
      />
      {query.isPending && <Loader size="sm" aria-label="読み込み中" />}
      {query.isError && <ErrorAlert>{query.error.message}</ErrorAlert>}
      {data && view && view.members.length === 0 && (
        <Text c="dimmed">このシーズンの対象メンバーがいません。</Text>
      )}
      {data && view && view.members.length > 0 && (
        <Stack gap="xl">
          <AnalysisKpis view={view} />
          <PeopleBiasBlock data={data} filters={filters} view={view} />
          <StaffingBlock data={data} filters={filters} view={view} />
          <SeasonComparisonBlock
            data={data}
            previousData={previousQuery.data}
            previousPending={previousQuery.isPending}
            filters={filters}
            season={props.season}
          />
        </Stack>
      )}
    </Stack>
  );
}
