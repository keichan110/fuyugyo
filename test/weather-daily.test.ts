import { describe, expect, it } from 'vitest';

import {
  dominant,
  jstDateString,
  jstMidnightToUtc,
  normalizeSymbol,
  summarizeDay,
  type Condition,
  type StepRow,
} from '../src/features/weather/daily';
import { parseLatLng, updateWeatherPointSchema } from '../src/features/weather/schema';

/** JST の日時（'2026-12-20', 9）から UTC の Date を作る */
function jst(date: string, hour: number): Date {
  return new Date(jstMidnightToUtc(date).getTime() + hour * 3600_000);
}

function step(
  date: string,
  hour: number,
  overrides: Partial<StepRow> & { stepHours?: number } = {},
): StepRow {
  return {
    time: jst(date, hour),
    stepHours: 1,
    temperatureC: null,
    precipitationMm: null,
    windSpeedMs: null,
    condition: null,
    ...overrides,
  };
}

describe('normalizeSymbol', () => {
  it('_day / _night / _polartwilight を除去して判定する', () => {
    expect(normalizeSymbol('clearsky_day')).toBe('clear');
    expect(normalizeSymbol('clearsky_night')).toBe('clear');
    expect(normalizeSymbol('fair_polartwilight')).toBe('clear');
  });

  it('partlycloudy は晴れ、fog はくもり扱い', () => {
    expect(normalizeSymbol('partlycloudy_day')).toBe('clear');
    expect(normalizeSymbol('cloudy')).toBe('cloudy');
    expect(normalizeSymbol('fog')).toBe('cloudy');
  });

  it('sleet → snow → rain の順に判定する', () => {
    expect(normalizeSymbol('lightsleetandthunder')).toBe('sleet');
    expect(normalizeSymbol('heavysnow')).toBe('snow');
    expect(normalizeSymbol('lightrainandsnow')).toBe('snow');
    expect(normalizeSymbol('heavyrainshowers_night')).toBe('rain');
    expect(normalizeSymbol('rain')).toBe('rain');
  });

  it('未知のコード・空は null', () => {
    expect(normalizeSymbol('unknown_day')).toBeNull();
    expect(normalizeSymbol('')).toBeNull();
    expect(normalizeSymbol(null)).toBeNull();
    expect(normalizeSymbol(undefined)).toBeNull();
  });
});

describe('dominant', () => {
  it('最頻値を返す', () => {
    expect(dominant(['clear', 'rain', 'rain'])).toBe('rain');
    expect(dominant(['snow', 'clear', 'clear'])).toBe('clear');
  });

  it('同数のときは悪い天気を採用する', () => {
    expect(dominant(['clear', 'cloudy'])).toBe('cloudy');
    expect(dominant(['cloudy', 'rain'])).toBe('rain');
    expect(dominant(['rain', 'sleet'])).toBe('sleet');
    expect(dominant(['snow', 'sleet', 'clear'])).toBe('snow');
  });

  it('空配列は null', () => {
    expect(dominant([])).toBeNull();
  });
});

describe('summarizeDay（1時間刻み）', () => {
  const date = '2026-12-20';
  const conds: [number, Condition][] = [
    [8, 'clear'],
    [9, 'clear'],
    [10, 'clear'],
    [11, 'cloudy'],
    [12, 'cloudy'],
    [13, 'snow'],
    [14, 'snow'],
    [15, 'snow'],
    [16, 'clear'],
    [17, 'clear'],
  ];
  const steps: StepRow[] = [
    ...conds.map(([h, c]) => step(date, h, { condition: c, precipitationMm: 0.5, windSpeedMs: h })),
    // 明け方の低温と夜間の高温（気温は1日全体、降水量・風はレッスン時間帯のみ）
    step(date, 5, { temperatureC: -12, precipitationMm: 10, windSpeedMs: 30 }),
    step(date, 20, { temperatureC: 4, precipitationMm: 10, windSpeedMs: 30 }),
    step(date, 12, { temperatureC: -2 }),
  ];

  it('午前・午後それぞれの代表の天気を返す', () => {
    const s = summarizeDay(date, steps);
    expect(s.morning).toBe('clear');
    expect(s.afternoon).toBe('snow');
  });

  it('気温は1日全体、降水量・風はレッスン時間帯のみで集計する', () => {
    const s = summarizeDay(date, steps);
    expect(s.tempMinC).toBe(-12);
    expect(s.tempMaxC).toBe(4);
    expect(s.precipitationMm).toBeCloseTo(5);
    expect(s.windMaxMs).toBe(17);
  });
});

describe('summarizeDay（6時間刻み）', () => {
  it('午前は9時開始・午後は15時開始の1点が使われ、3時・21時開始は使われない', () => {
    const date = '2026-12-25';
    const steps: StepRow[] = [
      step(date, 3, { stepHours: 6, condition: 'snow', temperatureC: -10 }),
      step(date, 9, { stepHours: 6, condition: 'clear', temperatureC: -3 }),
      step(date, 15, { stepHours: 6, condition: 'rain', temperatureC: -1 }),
      step(date, 21, { stepHours: 6, condition: 'snow', temperatureC: -6 }),
    ];
    const s = summarizeDay(date, steps);
    expect(s.morning).toBe('clear');
    expect(s.afternoon).toBe('rain');
    expect(s.tempMinC).toBe(-10);
    expect(s.tempMaxC).toBe(-1);
  });
});

describe('summarizeDay（日付・境界）', () => {
  it('別の日付は混ざらない', () => {
    const steps = [
      step('2026-12-20', 10, { condition: 'snow', temperatureC: -5 }),
      step('2026-12-21', 10, { condition: 'clear', temperatureC: 5 }),
    ];
    const s = summarizeDay('2026-12-20', steps);
    expect(s.morning).toBe('snow');
    expect(s.tempMaxC).toBe(-5);
  });

  it('データがない日はすべて null', () => {
    const s = summarizeDay('2026-12-22', [step('2026-12-20', 10, { condition: 'snow' })]);
    expect(s).toEqual({
      date: '2026-12-22',
      morning: null,
      afternoon: null,
      tempMaxC: null,
      tempMinC: null,
      precipitationMm: null,
      windMaxMs: null,
    });
  });

  it('JST の日付境界は UTC と9時間ずれる', () => {
    // UTC 2026-12-19T15:00 = JST 2026-12-20 00:00
    const atMidnight: StepRow = {
      ...step('2026-12-20', 0),
      time: new Date('2026-12-19T15:00:00Z'),
      temperatureC: -9,
    };
    // UTC 2026-12-19T14:00 = JST 2026-12-19 23:00
    const before: StepRow = {
      ...step('2026-12-19', 23),
      time: new Date('2026-12-19T14:00:00Z'),
      temperatureC: 9,
    };
    const s = summarizeDay('2026-12-20', [atMidnight, before]);
    expect(s.tempMinC).toBe(-9);
    expect(s.tempMaxC).toBe(-9);
  });
});

describe('jstDateString / jstMidnightToUtc', () => {
  it('UTC の日付を JST に変換する', () => {
    expect(jstDateString(new Date('2026-12-19T15:00:00Z'))).toBe('2026-12-20');
    expect(jstDateString(new Date('2026-12-19T14:59:59Z'))).toBe('2026-12-19');
  });

  it('JST 0:00 を UTC に戻す', () => {
    expect(jstMidnightToUtc('2026-12-20').toISOString()).toBe('2026-12-19T15:00:00.000Z');
  });
});

describe('parseLatLng', () => {
  it('Google マップの貼り付け形式を分解する', () => {
    expect(parseLatLng('36.1234, 137.5678')).toEqual({ latitude: 36.1234, longitude: 137.5678 });
    expect(parseLatLng('36.1234,137.5678')).toEqual({ latitude: 36.1234, longitude: 137.5678 });
    expect(parseLatLng('  36.1234 ,   137.5678  ')).toEqual({
      latitude: 36.1234,
      longitude: 137.5678,
    });
  });

  it('負の値も受け付ける', () => {
    expect(parseLatLng('-33.8, -70.5')).toEqual({ latitude: -33.8, longitude: -70.5 });
  });

  it('不正な形式は null', () => {
    expect(parseLatLng('')).toBeNull();
    expect(parseLatLng('36.1234')).toBeNull();
    expect(parseLatLng('abc, def')).toBeNull();
    expect(parseLatLng('36.1, 137.5, 10')).toBeNull();
  });
});

describe('updateWeatherPointSchema', () => {
  it('緯度・経度を小数点以下4桁に切り捨てる（四捨五入しない）', () => {
    const parsed = updateWeatherPointSchema.parse({
      name: ' ゲレンデ ',
      latitude: 36.123499,
      longitude: 137.56789,
      elevationM: 1500,
    });
    expect(parsed).toEqual({
      name: 'ゲレンデ',
      latitude: 36.1234,
      longitude: 137.5678,
      elevationM: 1500,
    });
  });

  it('範囲外・小数の標高・空の名前は拒否する', () => {
    const base = { name: 'a', latitude: 36, longitude: 137, elevationM: 100 };
    expect(updateWeatherPointSchema.safeParse({ ...base, latitude: 91 }).success).toBe(false);
    expect(updateWeatherPointSchema.safeParse({ ...base, longitude: -181 }).success).toBe(false);
    expect(updateWeatherPointSchema.safeParse({ ...base, elevationM: 10.5 }).success).toBe(false);
    expect(updateWeatherPointSchema.safeParse({ ...base, elevationM: 9001 }).success).toBe(false);
    expect(updateWeatherPointSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });
});
