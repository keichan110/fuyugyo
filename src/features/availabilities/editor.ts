import { addDays, isJapaneseHoliday, weekdayIndex } from '@/features/shifts/view-utils';
import { scheduleMaximumDate } from '@/lib/schedule-date-range';

import type { Availability, UpdateMyAvailabilitiesInput } from './schema';

export type StagedAvailability = Pick<Availability, 'type' | 'note'>;
export type DateEditability = 'editable' | 'past' | 'locked' | 'future';

/** 指定日の編集内容をステージ状態へ反映する。 */
export function stageAvailability(
  current: ReadonlyMap<string, StagedAvailability>,
  date: string,
  value: StagedAvailability,
): Map<string, StagedAvailability> {
  const next = new Map(current);
  next.set(date, value);
  return next;
}

/** 保存値とステージ値を比較し、API に送る最小限の差分を返す。 */
export function buildAvailabilityChanges(
  saved: ReadonlyMap<string, Pick<Availability, 'type' | 'note'>>,
  staged: ReadonlyMap<string, StagedAvailability>,
): UpdateMyAvailabilitiesInput['changes'] {
  const changes: UpdateMyAvailabilitiesInput['changes'] = [];
  for (const [date, value] of staged) {
    const original = saved.get(date);
    if (!original || original.type !== value.type || original.note !== value.note) {
      changes.push({ date, type: value.type, note: value.note });
    }
  }
  return changes.sort((a, b) => a.date.localeCompare(b.date));
}

/** 日付が本人の可用性入力対象かをクライアント側で判定する。 */
export function getDateEditability(
  date: string,
  today: string,
  lockedDates: ReadonlySet<string>,
): DateEditability {
  if (date < today) return 'past';
  if (date > scheduleMaximumDate(today)) return 'future';
  if (lockedDates.has(date)) return 'locked';
  return 'editable';
}

/** 一括設定の分類。祝日は 'holiday'、それ以外は曜日インデックス（0=日）。 */
export type BulkCategory = 'holiday' | number;

/** 一括設定の計画結果。 */
export type BulkAvailabilityPlan = {
  /** 適用対象の日付（昇順）。 */
  targetDates: string[];
  /** 対象のうち、現在値が存在し type が異なる（上書きになる）日数。 */
  overwriteCount: number;
  /** 編集不可のため除外した日数（理由別）。 */
  excluded: { past: number; locked: number; future: number };
};

/** 日付を一括設定の分類へ変換する。祝日（振替休日を含む）は曜日に関わらず 'holiday' のみ。 */
export function getBulkCategory(date: string): BulkCategory {
  return isJapaneseHoliday(date) ? 'holiday' : weekdayIndex(date);
}

/** YYYY-MM の全日付を昇順で列挙する。 */
export function listMonthDates(month: string): string[] {
  const dates: string[] = [];
  let date = `${month}-01`;
  while (date.startsWith(month)) {
    dates.push(date);
    date = addDays(date, 1);
  }
  return dates;
}

/** 選択した分類に該当する日を対象に、一括設定の対象日・上書き件数・除外件数を計算する。 */
export function planBulkAvailability({
  month,
  categories,
  type,
  today,
  lockedDates,
  getCurrent,
}: {
  month: string;
  categories: ReadonlySet<BulkCategory>;
  type: Availability['type'];
  today: string;
  lockedDates: ReadonlySet<string>;
  getCurrent: (date: string) => StagedAvailability | undefined;
}): BulkAvailabilityPlan {
  const plan: BulkAvailabilityPlan = {
    targetDates: [],
    overwriteCount: 0,
    excluded: { past: 0, locked: 0, future: 0 },
  };
  for (const date of listMonthDates(month)) {
    if (!categories.has(getBulkCategory(date))) continue;
    const editability = getDateEditability(date, today, lockedDates);
    if (editability !== 'editable') {
      plan.excluded[editability] += 1;
      continue;
    }
    plan.targetDates.push(date);
    const current = getCurrent(date);
    if (current && current.type !== type) plan.overwriteCount += 1;
  }
  return plan;
}

/** 対象日へ一括で type を設定した新しい Map を返す。メモは現在値を保持し、元の Map は変更しない。 */
export function applyBulkAvailability(
  staged: ReadonlyMap<string, StagedAvailability>,
  targetDates: readonly string[],
  type: Availability['type'],
  getCurrent: (date: string) => StagedAvailability | undefined,
): Map<string, StagedAvailability> {
  const next = new Map(staged);
  for (const date of targetDates) {
    next.set(date, { type, note: getCurrent(date)?.note ?? null });
  }
  return next;
}
