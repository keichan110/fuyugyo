import { Badge, Card, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';

import type { ShiftViewItem } from '../schema';
import { formatDate, parseDate, WEEKDAY_LABELS } from '../view-utils';

type MonthlyViewProps = {
  /** 対象月（YYYY-MM） */
  month: string;
  shifts: ShiftViewItem[];
  /** 日セルをクリックしたとき（その日の週次ビューへ深掘りする） */
  onSelectDay: (dateStr: string) => void;
};

/** カレンダーセル。null は前月・翌月の空白を表す。 */
type Cell = { dateStr: string; day: number } | null;

/** 対象月のカレンダーセル配列（先頭は日曜揃えの空白で埋める）を作る */
function buildCells(month: string): Cell[] {
  const monthStart = parseDate(`${month}-01`);
  const year = monthStart.getUTCFullYear();
  const monthIndex = monthStart.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = monthStart.getUTCDay(); // 0=日曜

  const cells: Cell[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(Date.UTC(year, monthIndex, day)));
    cells.push({ dateStr, day });
  }
  return cells;
}

/** 曜日見出しの色（日=赤・土=青） */
function headerColor(index: number): string | undefined {
  if (index === 0) {
    return 'red';
  }
  if (index === 6) {
    return 'blue';
  }
  return undefined;
}

/**
 * 月次ビュー: 7列のカレンダーグリッドで当月を表示する（モバイルでも7列を維持）。
 * 各日セルにシフト件数バッジを出し、クリックでその日の週次ビューへ遷移する。
 */
export function MonthlyView({ month, shifts, onSelectDay }: MonthlyViewProps) {
  // 日付（YYYY-MM-DD）→ 件数
  const countByDate = new Map<string, number>();
  for (const shift of shifts) {
    countByDate.set(shift.date, (countByDate.get(shift.date) ?? 0) + 1);
  }

  const cells = buildCells(month);

  return (
    <Card withBorder padding="xs" radius="md">
      <SimpleGrid cols={7} spacing={4}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={label}
            ta="center"
            size="xs"
            fw={500}
            c={headerColor(index) ?? 'dimmed'}
            py={4}
          >
            {label}
          </Text>
        ))}
        {cells.map((cell, index) => {
          if (!cell) {
            // 月初前の空白セル（キーは安定した位置インデックス）
            return <div key={`blank-${index}`} />;
          }
          const count = countByDate.get(cell.dateStr) ?? 0;
          return (
            <UnstyledButton
              key={cell.dateStr}
              onClick={() => onSelectDay(cell.dateStr)}
              p={4}
              style={{
                aspectRatio: '1',
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Stack gap={2} align="center">
                <Text size="xs">{cell.day}</Text>
                {count > 0 && (
                  <Badge color="blue" variant="light" size="xs">
                    {count}
                  </Badge>
                )}
              </Stack>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Card>
  );
}
