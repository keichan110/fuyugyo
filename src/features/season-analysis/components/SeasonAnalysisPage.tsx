import { useMemo, useState } from 'react';

import { Grid, Loader, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { seasonName } from '@/features/shifts/season';

import { buildAnalysisView, type AnalysisFilters, type DepartmentFilter } from '../aggregators';
import { buildComparison, comparisonPeriodLabel } from '../comparison';
import { buildDependency } from '../dependency';
import { useSeasonAnalysis } from '../queries';
import { buildShiftTypeMix } from '../shift-type-mix';
import { AnalysisBlock } from './AnalysisBlock';
import { AnalysisFilterBar } from './AnalysisFilterBar';
import { AnalysisKpis } from './AnalysisKpis';
import { AnalysisPanel } from './AnalysisPanel';
import { AvailabilityScatterChart } from './AvailabilityScatterChart';
import { DependencySection } from './DependencySection';
import { MemberDaysChart } from './MemberDaysChart';
import { MemberMonthHeatmap } from './MemberMonthHeatmap';
import {
  ComparisonMemberChart,
  ComparisonMonthlyChart,
  ComparisonSummary,
} from './SeasonComparisonSection';
import { ShiftTypeMixChart } from './ShiftTypeMixChart';
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
  const query = useSeasonAnalysis(props.season);
  const data = query.data;
  const previousQuery = useSeasonAnalysis(props.season - 1);
  const previousData = previousQuery.data;
  const filters = useMemo<AnalysisFilters>(
    () => ({ department: props.department, includeDrafts }),
    [props.department, includeDrafts],
  );
  const view = useMemo(() => (data ? buildAnalysisView(data, filters) : null), [data, filters]);
  const shiftTypeMix = useMemo(
    () => (data ? buildShiftTypeMix(data, filters) : null),
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
      />
      {query.isPending && <Loader size="sm" aria-label="読み込み中" />}
      {query.isError && <ErrorAlert>{query.error.message}</ErrorAlert>}
      {view && view.members.length === 0 && (
        <Text c="dimmed">このシーズンの対象メンバーがいません。</Text>
      )}
      {view && view.members.length > 0 && (
        <Stack gap="xl">
          <AnalysisKpis view={view} />
          <AnalysisBlock title="人の偏り" question="誰に偏っているか、いつから続いているかを見る">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <AnalysisPanel
                  title="メンバー別の勤務日数"
                  description={
                    props.department === 'all'
                      ? undefined
                      : '灰色は他部門での勤務日数（兼任の参考。並び順・平均には含めない）'
                  }
                >
                  {(expanded) => (
                    <MemberDaysChart
                      showOtherDepartment={props.department !== 'all'}
                      members={view.members}
                      averageDays={view.averageDays}
                      expanded={expanded}
                    />
                  )}
                </AnalysisPanel>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <AnalysisPanel
                  title="勤務可能日数と勤務日数"
                  description={`勤務可能日＝枠のある日のうち「勤務不可」の申告がない日（要調整は含む）。${
                    view.workRatio === null
                      ? ''
                      : ` 全体の勤務率の目安：${Math.round(view.workRatio * 100)}%`
                  }`}
                >
                  {(expanded) => (
                    <AvailabilityScatterChart members={view.members} expanded={expanded} />
                  )}
                </AnalysisPanel>
              </Grid.Col>
              {shiftTypeMix && (
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <AnalysisPanel
                    title="勤務種別の構成比"
                    description={`各メンバーの配置回数に占める勤務種別の割合（量はメンバー別の勤務日数を参照）。回数は枠単位。${
                      shiftTypeMix.excludedCount > 0
                        ? ` 配置のない${shiftTypeMix.excludedCount}名は除外。`
                        : ''
                    }`}
                  >
                    {(expanded) => <ShiftTypeMixChart mix={shiftTypeMix} expanded={expanded} />}
                  </AnalysisPanel>
                </Grid.Col>
              )}
              {/* 種別構成比と並べて半幅にする。横にはみ出す月は表コンテナ内でスクロールし、氏名列は固定される */}
              <Grid.Col span={{ base: 12, md: shiftTypeMix ? 6 : 12 }}>
                <AnalysisPanel
                  title="人×月の勤務日数"
                  scrollable={false}
                  description="セルの数値は勤務日数。色は同じ月の対象メンバー中央値との差（オレンジ=多い、青=少ない）。斜線は予定のみの月。クリックでシフト管理（部門）を開きます。"
                >
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
            </Grid>
          </AnalysisBlock>
          <AnalysisBlock
            title="枠・体制"
            question="枠が足りない時期や、特定の人への依存はないかを見る"
          >
            <Grid>
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
                    {(expanded) => (
                      <DependencySection departments={dependency} expanded={expanded} />
                    )}
                  </AnalysisPanel>
                </Grid.Col>
              )}
            </Grid>
          </AnalysisBlock>
          <AnalysisBlock title="前シーズンとの比較" question="前シーズンからどう変わったかを見る">
            {comparison === null || comparison.previousIsEmpty ? (
              <Text size="sm" c="dimmed">
                {comparison === null && previousQuery.isPending
                  ? '前シーズンのデータを読み込んでいます。'
                  : '前シーズンのデータがありません'}
              </Text>
            ) : (
              <Stack gap="sm">
                <ComparisonSummary view={comparison} season={props.season} />
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <AnalysisPanel
                      title="月別の延べ勤務日数"
                      description="前シーズンは全期間を表示します。今シーズンの今後の月は予定と見比べてください。"
                    >
                      {(expanded) => (
                        <ComparisonMonthlyChart
                          view={comparison}
                          season={props.season}
                          expanded={expanded}
                        />
                      )}
                    </AnalysisPanel>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <AnalysisPanel
                      title="メンバー別の増減"
                      description={`${seasonName(props.season)} − ${seasonName(props.season - 1)}（${comparisonPeriodLabel(comparison)}）。「新規」は前シーズンに配置がない人。今シーズンに配置がない人は減少として表示します。`}
                    >
                      {(expanded) => (
                        <ComparisonMemberChart view={comparison} expanded={expanded} />
                      )}
                    </AnalysisPanel>
                  </Grid.Col>
                </Grid>
              </Stack>
            )}
          </AnalysisBlock>
        </Stack>
      )}
    </Stack>
  );
}
