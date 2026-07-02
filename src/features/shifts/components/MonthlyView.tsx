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
function headerClass(index: number): string {
  if (index === 0) {
    return 'text-red-600';
  }
  if (index === 6) {
    return 'text-blue-600';
  }
  return 'text-muted-foreground';
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
    <div className="border-border bg-card rounded-md border p-2">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={label} className={`py-1 text-center text-xs font-medium ${headerClass(index)}`}>
            {label}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell) {
            // 月初前の空白セル（キーは安定した位置インデックス）
            return <div key={`blank-${index}`} />;
          }
          const count = countByDate.get(cell.dateStr) ?? 0;
          return (
            <button
              type="button"
              key={cell.dateStr}
              onClick={() => onSelectDay(cell.dateStr)}
              className="border-border/60 bg-background hover:border-ring focus-visible:ring-ring flex aspect-square flex-col items-center gap-0.5 rounded border p-1 text-xs focus-visible:ring-1 focus-visible:outline-none"
            >
              <span className="text-foreground">{cell.day}</span>
              {count > 0 && (
                <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[10px] leading-tight">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
