import { useState } from 'react';

import { Box, Grid, Select, Stack, Table, Text } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';

import type { DepartmentFilter } from '../aggregators';
import type { BurdenView, MemberBurden } from '../consecutive';
import { AnalysisPanel, PANEL_BODY_HEIGHT, PANEL_EXPANDED_SCROLL_HEIGHT } from './AnalysisPanel';
import classes from './MemberMonthHeatmap.module.css';

function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function memberLabel(member: MemberBurden): string {
  return `${member.name}：最大連勤 ${member.maxRun.days}日（${formatDay(member.maxRun.from)}〜${formatDay(member.maxRun.to)}${member.maxRun.includesFuture ? '・予定を含む' : ''}）、最大連続勤務 ${member.maxWeekRun.weeks}週（${formatDay(member.maxWeekRun.fromWeekStart)}〜${formatDay(member.maxWeekRun.toWeekStart)}の週${member.maxWeekRun.includesFuture ? '・予定を含む' : ''}）`;
}

/** シーズン全体の連勤・連続勤務週を比較し、選択したメンバーの週別勤務を表示する。 */
export function WorkBurden({
  view,
  department,
}: {
  view: BurdenView;
  department: DepartmentFilter;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = view.members.find((member) => member.id === selectedId);
  const color = department === 'all' ? 'teal' : getDepartmentAppearance(department).color;
  const maxWeeks = Math.max(1, ...view.members.map((member) => member.maxWeekRun.weeks));
  const maxDays = Math.max(1, ...view.members.map((member) => member.maxRun.days));
  // 整数値を保った目盛りを最大5区間で描き、同じ座標の人数も明示する。
  const weekStep = Math.max(1, Math.ceil(maxWeeks / 5));
  const dayStep = Math.max(1, Math.ceil(maxDays / 5));
  const weekLimit = Math.ceil(maxWeeks / weekStep) * weekStep;
  const dayLimit = Math.ceil(maxDays / dayStep) * dayStep;
  const groups = new Map<string, MemberBurden[]>();
  for (const member of view.members) {
    const key = `${member.maxWeekRun.weeks}:${member.maxRun.days}`;
    const group = groups.get(key);
    if (group) group.push(member);
    else groups.set(key, [member]);
  }
  if (view.members.length === 0) return <Text c="dimmed">対象の勤務データがありません。</Text>;
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <AnalysisPanel
          title="連勤と連続勤務週"
          scrollable={false}
          description="右ほど毎週の勤務が長く続き、上ほど連勤が長い傾向です。それぞれの最大値は別の時期の場合があります。点を押すと詳細を表示します。"
        >
          {(expanded) => (
            <Box h={expanded ? 480 : PANEL_BODY_HEIGHT}>
              <svg
                width="100%"
                height={expanded ? 'calc(100% - 40px)' : '100%'}
                viewBox="0 0 520 320"
                role="group"
                aria-label="最大連続勤務週数と最大連勤日数の散布図"
              >
                {Array.from({ length: dayLimit / dayStep + 1 }, (_, index) => {
                  const value = index * dayStep;
                  const y = 260 - (value / dayLimit) * 230;
                  return (
                    <g key={value}>
                      <line
                        x1={60}
                        x2={490}
                        y1={y}
                        y2={y}
                        stroke="var(--mantine-color-default-border)"
                        strokeDasharray="4 4"
                      />
                      <text x={50} y={y + 4} textAnchor="end" fontSize={12} fill="currentColor">
                        {value}
                      </text>
                    </g>
                  );
                })}
                {Array.from({ length: weekLimit / weekStep + 1 }, (_, index) => {
                  const value = index * weekStep;
                  return (
                    <text
                      key={value}
                      x={60 + (value / weekLimit) * 430}
                      y={280}
                      textAnchor="middle"
                      fontSize={12}
                      fill="currentColor"
                    >
                      {value}
                    </text>
                  );
                })}
                <text x={275} y={309} textAnchor="middle" fontSize={13} fill="currentColor">
                  最大連続勤務週数（週）
                </text>
                <text
                  transform="translate(16 145) rotate(-90)"
                  textAnchor="middle"
                  fontSize={13}
                  fill="currentColor"
                >
                  最大連勤日数（日）
                </text>
                {[...groups.entries()].map(([key, members]) => {
                  const first = members[0];
                  if (!first) return null;
                  const active = members.some((member) => member.id === selected?.id);
                  // 同値の点はまとめ、クリックするたびに該当メンバーを順に選ぶ。
                  const selectNext = () => {
                    const current = members.findIndex((member) => member.id === selected?.id);
                    const next = members[(current + 1) % members.length];
                    if (next) setSelectedId(next.id);
                  };
                  return (
                    <g
                      key={key}
                      role="button"
                      tabIndex={0}
                      aria-label={members.map(memberLabel).join('。')}
                      aria-pressed={active}
                      onClick={selectNext}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectNext();
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{members.map(memberLabel).join('\n')}</title>
                      <circle
                        cx={60 + (first.maxWeekRun.weeks / weekLimit) * 430}
                        cy={260 - (first.maxRun.days / dayLimit) * 230}
                        r={12}
                        fill="transparent"
                      />
                      <circle
                        cx={60 + (first.maxWeekRun.weeks / weekLimit) * 430}
                        cy={260 - (first.maxRun.days / dayLimit) * 230}
                        r={active ? 8 : 6}
                        fill={`var(--mantine-color-${color}-6)`}
                        stroke={active ? 'var(--mantine-color-text)' : 'var(--mantine-color-body)'}
                        strokeWidth={2}
                      />
                      {members.length > 1 && (
                        <text
                          x={60 + (first.maxWeekRun.weeks / weekLimit) * 430 + 10}
                          y={260 - (first.maxRun.days / dayLimit) * 230 - 8}
                          fontSize={11}
                          fill="currentColor"
                        >
                          {members.length}名
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {expanded && (
                <Text size="sm" aria-live="polite">
                  {selected
                    ? `${selected.name}を選択中。拡大表示を閉じると週別の勤務を確認できます。`
                    : '点を選択後、拡大表示を閉じると週別の勤務を確認できます。'}
                </Text>
              )}
            </Box>
          )}
        </AnalysisPanel>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <AnalysisPanel
          title="選択した人の勤務パターン"
          scrollable={false}
          description="週は月曜始まり。セルは勤務日数、斜線は予定のみの週。勤務のない週で連続は途切れます。"
        >
          {(expanded) => (
            <Stack gap="sm">
              <Select
                label="メンバー"
                placeholder="点を押すか、名前で検索"
                searchable
                clearable
                value={selected?.id ?? null}
                onChange={setSelectedId}
                data={view.members.map((member) => ({ value: member.id, label: member.name }))}
              />
              {selected ? (
                <>
                  <Text size="sm">{memberLabel(selected)}</Text>
                  <WeeklyWorkHeatmap
                    view={{ ...view, members: [selected] }}
                    department={department}
                    expanded={expanded}
                  />
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  散布図で気になる人を選ぶと、週別の勤務を確認できます。同じ位置に複数名いる場合は、点を押すたびに切り替わります。
                </Text>
              )}
            </Stack>
          )}
        </AnalysisPanel>
      </Grid.Col>
    </Grid>
  );
}

/** 週の勤務日数（0〜7）の濃淡。部門=全体は teal、部門選択時はその部門色 */
function weekCellBackground(days: number, color: string): string {
  const intensity = Math.round((days / 7) * 75) + 15;
  return `color-mix(in srgb, var(--mantine-color-${color}-6) ${intensity}%, transparent)`;
}

/** 人×週の勤務パターン。縦横スクロールを1コンテナで持ち、見出し行と氏名列を固定する。 */
function WeeklyWorkHeatmap({
  view,
  department,
  expanded,
}: {
  view: BurdenView;
  department: DepartmentFilter;
  expanded: boolean;
}) {
  const color = department === 'all' ? 'teal' : getDepartmentAppearance(department).color;
  return (
    <Box
      className={classes.scroller}
      h={expanded ? PANEL_EXPANDED_SCROLL_HEIGHT : PANEL_BODY_HEIGHT}
    >
      <Table
        withRowBorders={false}
        className={classes.table}
        miw={Math.max(360, view.weeks.length * 48 + 140)}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th className={`${classes.nameCell} ${classes.corner}`}>メンバー</Table.Th>
            {view.weeks.map((week) => (
              <Table.Th key={week} ta="center" className={classes.headCell}>
                {formatDay(week)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {view.members.map((member) => (
            <Table.Tr key={member.id}>
              <Table.Td className={classes.nameCell}>{member.name}</Table.Td>
              {view.weeks.map((week) => {
                const cell = member.weekCells.get(week);
                const label = `${member.name} ${formatDay(week)}の週 ${cell?.days ?? 0}日${
                  cell?.plannedOnly ? '・予定のみ' : ''
                }`;
                return (
                  <Table.Td key={week} p={2}>
                    <Box
                      className={classes.cell}
                      data-planned={cell?.plannedOnly || undefined}
                      style={{
                        backgroundColor: cell ? weekCellBackground(cell.days, color) : undefined,
                      }}
                      role="img"
                      aria-label={label}
                      title={label}
                    >
                      {cell ? cell.days : ''}
                    </Box>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
