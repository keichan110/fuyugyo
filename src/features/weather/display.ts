import type { Condition, DaySummary } from './daily';

/** 天気の表示ラベル（アイコンのアクセシブルラベルに使う） */
export const CONDITION_LABELS: Record<Condition, string> = {
  clear: '晴れ',
  cloudy: 'くもり',
  rain: '雨',
  sleet: 'みぞれ',
  snow: '雪',
};

/**
 * 表示する天気の並びを決める。
 * 午前と午後が同じ、またはどちらかが欠けているときは1つ、異なるときは午前→午後の2つ。
 *
 * @param day - 日別サマリー
 * @returns 表示する天気（なければ空配列）
 */
export function pickConditions(day: Pick<DaySummary, 'morning' | 'afternoon'>): Condition[] {
  const { morning, afternoon } = day;
  if (morning && afternoon) {
    return morning === afternoon ? [morning] : [morning, afternoon];
  }
  const only = morning ?? afternoon;
  return only ? [only] : [];
}

/**
 * 最高・最低気温を `3°/-5°` 形式にする（整数に丸める）。
 *
 * @param day - 日別サマリー
 * @returns 表示文字列。どちらも無ければ null
 */
export function formatTemperature(day: Pick<DaySummary, 'tempMaxC' | 'tempMinC'>): string | null {
  const { tempMaxC, tempMinC } = day;
  if (tempMaxC === null && tempMinC === null) return null;
  const format = (value: number | null) => (value === null ? '-' : `${normalizeZero(value)}°`);
  return `${format(tempMaxC)}/${format(tempMinC)}`;
}

/** 丸めた結果の -0 を 0 にそろえる */
function normalizeZero(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/**
 * 最終更新時刻を JST の `11/12 09:23` 形式にする。
 *
 * @param date - 取得時刻
 * @returns 整形した文字列
 */
export function formatFetchedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}
