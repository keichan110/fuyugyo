import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import { useMonthlyView, useWeeklyView } from '../queries';
import type { ShiftViewSummary } from '../schema';
import { addDays, addMonths, shortDateLabel, todayString, toMonth } from '../view-utils';
import { MonthlyView } from './MonthlyView';
import { WeeklyView } from './WeeklyView';

/** 表示モード（週次/月次） */
export type ShiftViewMode = 'weekly' | 'monthly';

type ShiftViewerProps = {
  /** 表示モード */
  view: ShiftViewMode;
  /** 基準日（YYYY-MM-DD）。週次は週の開始日、月次は当月の任意日を表す */
  date: string;
  /** 表示状態の変更（URL 検索パラメータへ反映され共有可能リンクになる） */
  onChange: (next: { view: ShiftViewMode; date: string }) => void;
};

/** サマリ（件数・割り当て総数・部門別）を表示するパネル */
function SummaryPanel({ summary }: { summary: ShiftViewSummary }) {
  const departments = Object.entries(summary.byDepartment);
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group gap="lg">
          <Text size="sm">
            シフト数{' '}
            <Text component="span" fw={500}>
              {summary.totalShifts}
            </Text>
          </Text>
          <Text size="sm">
            割り当て総数{' '}
            <Text component="span" fw={500}>
              {summary.totalAssignments}
            </Text>
          </Text>
        </Group>
        {departments.length > 0 && (
          <Group gap={6}>
            {departments.map(([name, count]) => (
              <Badge key={name} color="gray" variant="light">
                {name} {count}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  );
}

/**
 * シフト表示ビュー本体。週次/月次の切り替え・期間ナビゲーション・集計表示を担い、
 * データは1リクエスト（weekly-view / monthly-view）で取得する。
 * 表示状態（view・date）は親（ルート）が URL 検索パラメータとして保持するため、
 * 任意の週/日への共有可能な深いリンクが成立する。
 */
export function ShiftViewer({ view, date, onChange }: ShiftViewerProps) {
  const month = toMonth(date);
  const weekly = useWeeklyView(view === 'weekly' ? date : undefined);
  const monthly = useMonthlyView(view === 'monthly' ? month : undefined);

  const active = view === 'weekly' ? weekly : monthly;

  const goPrev = () => {
    onChange({
      view,
      date: view === 'weekly' ? addDays(date, -7) : `${addMonths(month, -1)}-01`,
    });
  };
  const goNext = () => {
    onChange({
      view,
      date: view === 'weekly' ? addDays(date, 7) : `${addMonths(month, 1)}-01`,
    });
  };
  const goToday = () => {
    onChange({ view, date: todayString() });
  };

  const rangeLabel =
    view === 'weekly'
      ? `${shortDateLabel(date)} 〜 ${shortDateLabel(addDays(date, 6))}`
      : `${month.replace('-', '年')}月`;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>シフト表</Title>
        <SegmentedControl
          value={view}
          onChange={(value) => onChange({ view: value as ShiftViewMode, date })}
          data={[
            { label: '週', value: 'weekly' },
            { label: '月', value: 'monthly' },
          ]}
        />
      </Group>

      <Group justify="space-between">
        <Button type="button" variant="outline" size="sm" onClick={goPrev}>
          ← 前
        </Button>
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {rangeLabel}
          </Text>
          <Button type="button" variant="subtle" size="sm" onClick={goToday}>
            今日
          </Button>
        </Group>
        <Button type="button" variant="outline" size="sm" onClick={goNext}>
          次 →
        </Button>
      </Group>

      {active.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {active.isError && (
        <Alert color="red">{active.error?.message ?? 'シフトの取得に失敗しました'}</Alert>
      )}

      {active.data && (
        <>
          <SummaryPanel summary={active.data.summary} />
          {view === 'weekly' ? (
            <WeeklyView dateFrom={date} shifts={active.data.shifts} />
          ) : (
            <MonthlyView
              month={month}
              shifts={active.data.shifts}
              onSelectDay={(day) => onChange({ view: 'weekly', date: day })}
            />
          )}
        </>
      )}
    </Stack>
  );
}
