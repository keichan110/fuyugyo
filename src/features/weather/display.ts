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

/**
 * レッスン時間帯の降水量を `1.5mm` 形式（0.1mm 単位）にする。
 *
 * @param value - 降水量（mm）
 * @returns 表示文字列。値がなければ null
 */
export function formatPrecipitation(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(1)}mm`;
}

/**
 * レッスン時間帯の最大風速を `6m/s` 形式（整数）にする。
 *
 * @param value - 風速（m/s）
 * @returns 表示文字列。値がなければ null
 */
export function formatWindMax(value: number | null): string | null {
  return value === null ? null : `${Math.round(value)}m/s`;
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

/**
 * 時間別ステップの時刻ラベルを JST で作る。1時間刻みは `6時`、6時間刻みは `9–15時`
 * （深夜をまたぐ場合は `21–3時`）。
 *
 * @param time - ステップの開始時刻
 * @param stepHours - ステップの時間数（1 または 6）
 * @returns 時刻ラベル
 */
export function formatStepTimeLabel(time: Date, stepHours: number): string {
  const startHour = new Date(time.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
  if (stepHours <= 1) return `${startHour}時`;
  return `${startHour}–${(startHour + stepHours) % 24}時`;
}

/**
 * 時間別の気温を `-3°` 形式にする（整数に丸め、値がなければ `-`）。
 *
 * @param value - 気温（℃）
 * @returns 表示文字列
 */
export function formatStepTemperature(value: number | null): string {
  return value === null ? '-' : `${normalizeZero(value)}°`;
}

/**
 * 時間別の降水量を 0.1mm 単位で表示する（値がなければ `-`）。
 *
 * @param value - 降水量（mm）
 * @returns 表示文字列
 */
export function formatStepPrecipitation(value: number | null): string {
  return value === null ? '-' : value.toFixed(1);
}

/**
 * 時間別の風速を整数で表示する（値がなければ `-`）。
 *
 * @param value - 風速（m/s）
 * @returns 表示文字列
 */
export function formatStepWind(value: number | null): string {
  return value === null ? '-' : String(Math.round(value));
}
