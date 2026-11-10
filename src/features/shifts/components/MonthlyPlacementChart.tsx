import { useMemo, useState } from 'react';

import { BarChart } from '@mantine/charts';
import { Box, Group, ScrollArea, Stack, Text } from '@mantine/core';

import { AppButton } from '@/components/AppButton';

import type { AutoAssignContext } from '../schema';
import type { DetailedCellAssignment } from '../workload';
import type { DayAssignments } from './calendar-events';
import { monthlyPlacementData, monthlyPlacementDistribution } from './monthly-placement-data';
import classes from './ShiftManager.module.css';

type Props = {
  context: AutoAssignContext | undefined;
  shiftTypeId: string;
  savedAssignments: DetailedCellAssignment[];
  stagedAssignments: DetailedCellAssignment[];
  assignmentsByDay: DayAssignments;
  nameById: ReadonlyMap<string, string>;
  disabled: boolean;
  onSelectInstructor: (person: { id: string; name: string }) => void;
};

/** 表示枠の候補者・配置者の勤務日数分布を示し、該当メンバーから個人分析へつなぐ。 */
export function MonthlyPlacementChart(props: Props) {
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const data = useMemo(() => {
    if (!props.context) return [];
    const eligible = new Set(
      props.context.frames.find((frame) => frame.shiftTypeId === props.shiftTypeId)
        ?.eligibleInstructorIds,
    );
    // 未配置の候補も0日として含め、候補外になった配置者も見落とさないよう補う。
    const people = new Map(
      props.context.instructors
        .filter((person) => eligible.has(person.id))
        .map((person) => [person.id, { id: person.id, name: person.displayName }]),
    );
    for (const assigned of props.assignmentsByDay.values()) {
      for (const person of assigned)
        people.set(person.id, {
          id: person.id,
          name: props.nameById.get(person.id) ?? person.name,
        });
    }
    return monthlyPlacementData({
      people: [...people.values()],
      savedAssignments: props.savedAssignments,
      stagedAssignments: props.stagedAssignments,
    });
  }, [
    props.context,
    props.shiftTypeId,
    props.savedAssignments,
    props.stagedAssignments,
    props.assignmentsByDay,
    props.nameById,
  ]);
  const { bins, median } = monthlyPlacementDistribution(data);
  const selectedBin = bins.find((bin) => bin.days === selectedDays);
  if (!props.context)
    return (
      <Text size="sm" c="dimmed">
        メンバーの比較情報を取得できていません。
      </Text>
    );
  if (data.length === 0)
    return (
      <Text size="sm" c="dimmed">
        比較対象の候補者・配置者はいません。
      </Text>
    );
  return (
    <Stack gap="sm" mt="lg">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          当月勤務日数の分布
        </Text>
        <Text size="sm">
          対象 {data.length}名 ／ 中央値 {median}日
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        全部門・全種別 ／ 同日1日
      </Text>
      <ScrollArea type="auto" offsetScrollbars>
        <Box miw={Math.max(320, bins.length * 28)}>
          <BarChart
            h={300}
            data={bins}
            dataKey="days"
            series={[{ name: 'count', color: 'teal.6', label: '人数' }]}
            xAxisLabel="当月の勤務日数（日）"
            yAxisLabel="人数（名）"
            xAxisProps={{
              type: 'number',
              domain: [-0.5, Math.max(1, bins.length - 1) + 0.5],
              ticks: bins.map((bin) => bin.days),
              allowDecimals: false,
            }}
            yAxisProps={{ allowDecimals: false, domain: [0, (max: number) => Math.max(1, max)] }}
            referenceLines={
              median === null ? [] : [{ x: median, color: 'indigo.6', strokeDasharray: '5 5' }]
            }
            tooltipProps={{ labelFormatter: (label) => `勤務${label}日` }}
            valueFormatter={(value) => `${value}名`}
            barProps={{
              shape: (shape) => {
                const bin = bins[shape.index];
                if (!bin) return null;
                const interactive = !props.disabled && bin.count > 0;
                return (
                  <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.fill}
                    className={classes.histogramBar}
                    role="button"
                    tabIndex={interactive ? 0 : -1}
                    aria-label={`${bin.days}日勤務、${bin.count}名のメンバーを確認`}
                    aria-pressed={selectedDays === bin.days}
                    aria-disabled={!interactive}
                    onKeyDown={(event) => {
                      if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedDays(bin.days);
                      }
                    }}
                  />
                );
              },
              cursor: props.disabled ? 'default' : 'pointer',
              onClick: (_entry, index) => {
                const bin = bins[index];
                if (bin && !props.disabled) setSelectedDays(bin.days);
              },
            }}
            aria-label={`当月勤務日数の人数分布。対象${data.length}名、中央値${median}日。勤務日数を選択すると該当メンバーを確認できます`}
          />
        </Box>
      </ScrollArea>
      {selectedDays !== null && (
        <Stack gap="xs" aria-live="polite">
          <Text size="sm" fw={600}>
            {selectedDays}日勤務：{selectedBin?.count ?? 0}名
          </Text>
          <Stack gap="xs">
            {selectedBin?.members.map((person) => (
              <Group key={person.id} gap="xs" wrap="nowrap">
                <Text size="sm">{person.name}</Text>
                <AppButton
                  intent="secondary"
                  size="compact-xs"
                  aria-label={`${person.name}の分析を表示`}
                  disabled={props.disabled}
                  onClick={() => props.onSelectInstructor({ id: person.id, name: person.name })}
                >
                  分析
                </AppButton>
              </Group>
            ))}
          </Stack>
          {!selectedBin?.count && (
            <Text size="sm" c="dimmed">
              該当するメンバーはいません。
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
