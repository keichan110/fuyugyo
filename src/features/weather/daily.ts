/**
 * 天気の正規化と日別サマリーの集計（isomorphic・依存なしの純粋関数）。
 *
 * 日別サマリーの考え方
 * - 午前 = JST 8〜12時、午後 = JST 13〜17時（ステップの開始時刻が窓に入るものを集める）
 * - それぞれの窓で「いちばん多い天気」を代表にする。同数なら悪い天気を採用
 * - 最高・最低気温は1日全体（JST 0〜24時）で集計する（明け方の冷え込みでバーンの硬さを判断するため）。
 *   降水量・風はレッスン時間帯（8〜18時）で集計する
 * - MET Norway のステップは UTC 基準で、1〜60時間先は1時間刻み、3日目以降は6時間刻み
 *   （JST で 3/9/15/21 時開始）。遠い日は午前窓に9時開始、午後窓に15時開始の1点だけが入る
 *   （目安として割り切る）
 */

export const CONDITIONS = ['clear', 'cloudy', 'rain', 'sleet', 'snow'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** 同数のときの優先順位（大きいほど悪い天気） */
const SEVERITY: Record<Condition, number> = {
  clear: 0,
  cloudy: 1,
  rain: 2,
  sleet: 3,
  snow: 4,
};

/**
 * MET Norway の symbol_code（例: "lightrainshowers_day"）を5種類にまとめる。
 * 判定できないコードは null（集計から除外される）。
 *
 * @param raw - 元の symbol_code
 * @returns まとめた天気。判定不能なら null
 */
export function normalizeSymbol(raw: string | null | undefined): Condition | null {
  if (!raw) return null;
  const base = raw.replace(/_(day|night|polartwilight)$/, '');
  // みぞれ → 雪 → 雨 の順に判定する（"rainandsnow" 系を雨に誤分類しないため）
  if (base.includes('sleet')) return 'sleet';
  if (base.includes('snow')) return 'snow';
  if (base.includes('rain') || base.includes('drizzle')) return 'rain';
  if (base === 'clearsky' || base === 'fair' || base === 'partlycloudy') return 'clear';
  if (base === 'cloudy' || base === 'fog') return 'cloudy';
  return null;
}

/**
 * いちばん多い天気を返す。同数なら悪い天気を採用する。
 *
 * @param conditions - 天気の一覧
 * @returns 代表の天気。空なら null
 */
export function dominant(conditions: Condition[]): Condition | null {
  const counts = new Map<Condition, number>();
  for (const c of conditions) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: Condition | null = null;
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (best === null || n > bestCount || (n === bestCount && SEVERITY[c] > SEVERITY[best])) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** 日別集計の入力となる時間別ステップ */
export type StepRow = {
  /** ステップの開始時刻 */
  time: Date;
  /** 1 または 6 */
  stepHours: number;
  temperatureC: number | null;
  /** そのステップの期間（stepHours）の降水量 */
  precipitationMm: number | null;
  windSpeedMs: number | null;
  condition: Condition | null;
};

/** 日別サマリー */
export type DaySummary = {
  /** 'YYYY-MM-DD'（JST） */
  date: string;
  morning: Condition | null;
  afternoon: Condition | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  windMaxMs: number | null;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 窓の定義（開始時刻の hour で判定。MORNING_START <= hour < AFTERNOON_START が午前）
const MORNING_START_HOUR = 8;
const AFTERNOON_START_HOUR = 13;
const AFTERNOON_END_HOUR = 18; // 排他

// 最高・最低気温の集計窓（1日全体）
const TEMP_START_HOUR = 0;
const TEMP_END_HOUR = 24;
// 降水量・風の集計窓（レッスン時間帯）
const LESSON_START_HOUR = MORNING_START_HOUR;
const LESSON_END_HOUR = AFTERNOON_END_HOUR;

function jstParts(d: Date): { date: string; hour: number } {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, '0');
  const day = String(j.getUTCDate()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, hour: j.getUTCHours() };
}

/**
 * 指定時刻の JST 日付文字列を返す。
 *
 * @param now - 基準時刻
 * @returns 'YYYY-MM-DD'（JST）
 */
export function jstDateString(now: Date): string {
  return jstParts(now).date;
}

/**
 * JST の日付 0:00 に当たる UTC 時刻を返す。
 *
 * @param date - 'YYYY-MM-DD'（JST）
 * @returns その日の JST 0:00 の Date
 */
export function jstMidnightToUtc(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS);
}

function maxOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length > 0 ? Math.max(...v) : null;
}
function minOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length > 0 ? Math.min(...v) : null;
}
function sumOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) : null;
}

/**
 * 指定日（JST）の日別サマリーを集計する。steps は何日分混ざっていてもよい。
 *
 * @param date - 'YYYY-MM-DD'（JST）
 * @param steps - 時間別ステップ
 * @returns 日別サマリー。データがない項目は null
 */
export function summarizeDay(date: string, steps: StepRow[]): DaySummary {
  const sameDay = steps.map((s) => ({ s, p: jstParts(s.time) })).filter((x) => x.p.date === date);

  const inRange = (hour: number, from: number, to: number) => hour >= from && hour < to;
  const conds = (from: number, to: number) =>
    sameDay
      .filter((x) => inRange(x.p.hour, from, to))
      .map((x) => x.s.condition)
      .filter((c): c is Condition => c !== null);

  const tempRows = sameDay
    .filter((x) => inRange(x.p.hour, TEMP_START_HOUR, TEMP_END_HOUR))
    .map((x) => x.s);
  const lessonRows = sameDay
    .filter((x) => inRange(x.p.hour, LESSON_START_HOUR, LESSON_END_HOUR))
    .map((x) => x.s);

  return {
    date,
    morning: dominant(conds(MORNING_START_HOUR, AFTERNOON_START_HOUR)),
    afternoon: dominant(conds(AFTERNOON_START_HOUR, AFTERNOON_END_HOUR)),
    tempMaxC: maxOf(tempRows.map((s) => s.temperatureC)),
    tempMinC: minOf(tempRows.map((s) => s.temperatureC)),
    precipitationMm: sumOf(lessonRows.map((s) => s.precipitationMm)),
    windMaxMs: maxOf(lessonRows.map((s) => s.windSpeedMs)),
  };
}
