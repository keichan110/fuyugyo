import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          シフト数{' '}
          <span className="font-medium">{summary.totalShifts}</span>
        </span>
        <span>
          割り当て総数{' '}
          <span className="font-medium">{summary.totalAssignments}</span>
        </span>
      </div>
      {departments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {departments.map(([name, count]) => (
            <span
              key={name}
              className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground text-xs"
            >
              {name} {count}
            </span>
          ))}
        </div>
      )}
    </div>
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
      date:
        view === 'weekly' ? addDays(date, -7) : `${addMonths(month, -1)}-01`,
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-xl">シフト表</h2>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => onChange({ view: 'weekly', date })}
            className={`px-3 py-1 text-sm ${
              view === 'weekly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground'
            }`}
          >
            週
          </button>
          <button
            type="button"
            onClick={() => onChange({ view: 'monthly', date })}
            className={`px-3 py-1 text-sm ${
              view === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground'
            }`}
          >
            月
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={goPrev}>
          ← 前
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{rangeLabel}</span>
          <Button type="button" variant="ghost" size="sm" onClick={goToday}>
            今日
          </Button>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={goNext}>
          次 →
        </Button>
      </div>

      {active.isLoading && (
        <p className="text-muted-foreground text-sm">読み込み中…</p>
      )}
      {active.isError && (
        <p className="text-red-600 text-sm">
          {active.error?.message ?? 'シフトの取得に失敗しました'}
        </p>
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
    </section>
  );
}
