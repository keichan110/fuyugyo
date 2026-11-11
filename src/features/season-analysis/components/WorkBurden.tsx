import { useMemo, useState } from 'react';

import { Badge, Box, Group, Stack, Table, Text, UnstyledButton } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';

import type { DepartmentFilter } from '../aggregators';
import type { BurdenTop, BurdenView, MemberBurden } from '../consecutive';
import { PANEL_BODY_HEIGHT, PANEL_EXPANDED_SCROLL_HEIGHT } from './AnalysisPanel';
import classes from './MemberMonthHeatmap.module.css';

function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function formatTop(top: BurdenTop, unit: string): string {
  const [first] = top.names;
  if (first === undefined) return 'なし';
  const rest = top.names.length - 1;
  return `${top.value}${unit}（${first}${rest > 0 ? `ほか${rest}名` : ''}）`;
}

/** 「負担」ブロック先頭の要約1行 */
export function BurdenSummary({ view }: { view: BurdenView }) {
  return (
    <Text size="sm">
      最大連勤 {formatTop(view.maxRun, '日')} ／ 最大連続勤務週 {formatTop(view.maxWeekRun, '週')}
    </Text>
  );
}

/** 週の勤務日数（0〜7）の濃淡。部門=全体は teal、部門選択時はその部門色 */
function weekCellBackground(days: number, color: string): string {
  const intensity = Math.round((days / 7) * 75) + 15;
  return `color-mix(in srgb, var(--mantine-color-${color}-6) ${intensity}%, transparent)`;
}

/** 人×週の勤務パターン。縦横スクロールを1コンテナで持ち、見出し行と氏名列を固定する。 */
export function WeeklyWorkHeatmap({
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

type SortKey = 'name' | 'maxRun' | 'maxWeekRun' | 'recent';

const SORT_VALUE: Record<Exclude<SortKey, 'name'>, (member: MemberBurden) => number> = {
  maxRun: (m) => m.maxRun.days,
  maxWeekRun: (m) => m.maxWeekRun.weeks,
  recent: (m) => m.recentWeekStreak,
};

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Table.Th aria-sort={active ? 'descending' : undefined}>
      <UnstyledButton onClick={onClick} fw={600} fz="sm">
        {label}
        {active ? ' ▼' : ''}
      </UnstyledButton>
    </Table.Th>
  );
}

/** 負担の一覧。列見出しのクリックで並べ替える（初期は最大連続勤務週の降順）。 */
export function WorkBurdenTable({ view }: { view: BurdenView }) {
  const [sortKey, setSortKey] = useState<SortKey>('maxWeekRun');
  const rows = useMemo(() => {
    if (sortKey === 'name') {
      return [...view.members].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }
    const value = SORT_VALUE[sortKey];
    return [...view.members].sort(
      (a, b) => value(b) - value(a) || a.name.localeCompare(b.name, 'ja'),
    );
  }, [view.members, sortKey]);
  return (
    <Stack gap="xs">
      <Table.ScrollContainer minWidth={460}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <SortHeader
                label="名前"
                active={sortKey === 'name'}
                onClick={() => setSortKey('name')}
              />
              <SortHeader
                label="最大連勤"
                active={sortKey === 'maxRun'}
                onClick={() => setSortKey('maxRun')}
              />
              <SortHeader
                label="最大連続勤務週"
                active={sortKey === 'maxWeekRun'}
                onClick={() => setSortKey('maxWeekRun')}
              />
              <SortHeader
                label={
                  view.baseWeek === null
                    ? '直近の連続勤務週'
                    : `直近の連続勤務週（${formatDay(view.baseWeek)}の週時点）`
                }
                active={sortKey === 'recent'}
                onClick={() => setSortKey('recent')}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((member) => (
              <Table.Tr key={member.id}>
                <Table.Td>{member.name}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm">{member.maxRun.days}日</Text>
                    {member.maxRun.includesFuture && (
                      <Badge size="xs" variant="light" color="gray">
                        予定
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatDay(member.maxRun.from)}〜{formatDay(member.maxRun.to)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm">{member.maxWeekRun.weeks}週</Text>
                    {member.maxWeekRun.includesFuture && (
                      <Badge size="xs" variant="light" color="gray">
                        予定
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatDay(member.maxWeekRun.fromWeekStart)}〜
                    {formatDay(member.maxWeekRun.toWeekStart)}の週
                  </Text>
                </Table.Td>
                <Table.Td>{member.recentWeekStreak}週</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
