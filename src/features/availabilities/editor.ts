import type { Availability, UpdateMyAvailabilitiesInput } from './schema';

export type StagedAvailability = Pick<Availability, 'type' | 'note'> | null;
export type DateEditability = 'editable' | 'past' | 'season-outside' | 'locked';

/** 指定日の編集内容をステージ状態へ反映する。`null` は保存済み申告の解除を表す。 */
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
    if (value === null) {
      if (original) changes.push({ date, type: null });
      continue;
    }
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
  const month = Number(date.slice(5, 7));
  if (month < 1 || (month > 4 && month < 12)) return 'season-outside';
  if (date < today) return 'past';
  if (lockedDates.has(date)) return 'locked';
  return 'editable';
}
