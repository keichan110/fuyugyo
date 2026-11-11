import { useMemo } from 'react';

import { Grid } from '@mantine/core';

import type { AnalysisFilters, AnalysisView } from '../aggregators';
import type { SeasonAnalysis } from '../schema';
import { buildShiftTypeMix } from '../shift-type-mix';
import { AnalysisBlock } from './AnalysisBlock';
import { AnalysisPanel } from './AnalysisPanel';
import { AvailabilityScatterChart } from './AvailabilityScatterChart';
import { MemberDaysChart } from './MemberDaysChart';
import { MemberMonthHeatmap } from './MemberMonthHeatmap';
import { ShiftTypeMixChart } from './ShiftTypeMixChart';

type Props = {
  data: SeasonAnalysis;
  filters: AnalysisFilters;
  view: AnalysisView;
};

/** 「人の偏り」ブロック。勤務日数・勤務可能日数・勤務種別の構成比・人×月を並べる。 */
export function PeopleBiasBlock({ data, filters, view }: Props) {
  const shiftTypeMix = useMemo(() => buildShiftTypeMix(data, filters), [data, filters]);
  const showOtherDepartment = filters.department !== 'all';
  const workRatioNote =
    view.workRatio === null ? '' : ` 全体の勤務率の目安：${Math.round(view.workRatio * 100)}%`;
  const excludedNote =
    shiftTypeMix.excludedCount > 0 ? ` 配置のない${shiftTypeMix.excludedCount}名は除外。` : '';

  return (
    <AnalysisBlock title="人の偏り" question="誰に偏っているか、いつから続いているかを見る">
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="メンバー別の勤務日数"
            description={
              showOtherDepartment
                ? '灰色は他部門での勤務日数（兼任の参考。並び順・平均には含めない）'
                : undefined
            }
          >
            {(expanded) => (
              <MemberDaysChart
                showOtherDepartment={showOtherDepartment}
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
            description={`勤務可能日＝枠のある日のうち「勤務不可」の申告がない日（要調整は含む）。${workRatioNote}`}
          >
            {(expanded) => <AvailabilityScatterChart members={view.members} expanded={expanded} />}
          </AnalysisPanel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="勤務種別の構成比"
            description={`各メンバーの配置回数に占める勤務種別の割合（量はメンバー別の勤務日数を参照）。回数は枠単位。${excludedNote}`}
          >
            {(expanded) => <ShiftTypeMixChart mix={shiftTypeMix} expanded={expanded} />}
          </AnalysisPanel>
        </Grid.Col>
        {/* 種別構成比と並べて半幅にする。横にはみ出す月は表コンテナ内でスクロールし、氏名列は固定される */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AnalysisPanel
            title="人×月の勤務日数"
            scrollable={false}
            description="セルの数値は勤務日数。色は同じ月の対象メンバー中央値との差（オレンジ=多い、青=少ない）。斜線は予定のみの月。クリックでシフト管理（部門）を開きます。"
          >
            {(expanded) => (
              <MemberMonthHeatmap
                members={view.members}
                months={view.months}
                department={filters.department}
                expanded={expanded}
              />
            )}
          </AnalysisPanel>
        </Grid.Col>
      </Grid>
    </AnalysisBlock>
  );
}
