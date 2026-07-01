import type { ShiftViewItem } from '../schema';
import { addDays, shortDateLabel, weekdayIndex } from '../view-utils';

type WeeklyViewProps = {
  /** 週の開始日（YYYY-MM-DD） */
  dateFrom: string;
  shifts: ShiftViewItem[];
};

/** 土日の見出しを淡く色分けするための曜日別クラス */
function weekdayClass(dateStr: string): string {
  const day = weekdayIndex(dateStr);
  if (day === 0) {
    return 'text-red-600';
  }
  if (day === 6) {
    return 'text-blue-600';
  }
  return 'text-foreground';
}

/**
 * 週次ビュー: 開始日から7日間を日別カードの縦リストで表示する（モバイル可読）。
 * 各日のシフトを部門・種別・割り当て Instructor とともに並べる。
 */
export function WeeklyView({ dateFrom, shifts }: WeeklyViewProps) {
  // 日付（YYYY-MM-DD）→ その日のシフト配列にまとめる
  const byDate = new Map<string, ShiftViewItem[]>();
  for (const shift of shifts) {
    const list = byDate.get(shift.date) ?? [];
    list.push(shift);
    byDate.set(shift.date, list);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(dateFrom, i));

  return (
    <ul className="flex flex-col gap-2">
      {days.map((day) => {
        const dayShifts = byDate.get(day) ?? [];
        return (
          <li key={day} className="border-border bg-card rounded-md border p-3">
            <div className={`text-sm font-medium ${weekdayClass(day)}`}>{shortDateLabel(day)}</div>
            {dayShifts.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">シフトなし</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {dayShifts.map((shift) => (
                  <li
                    key={shift.id}
                    className="border-border/60 bg-background rounded border p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{shift.department.name}</span>
                      <span className="text-muted-foreground text-xs">{shift.shiftType.name}</span>
                    </div>
                    {shift.assignedInstructors.length > 0 ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {shift.assignedInstructors.map((inst) => inst.displayName).join('、')}
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-0.5 text-xs">割り当てなし</p>
                    )}
                    {shift.description && (
                      <p className="text-muted-foreground mt-0.5 text-xs">{shift.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
