import { describe, expect, it } from 'vitest';

import {
  formatFetchedAt,
  formatPrecipitation,
  formatStepPrecipitation,
  formatStepTemperature,
  formatStepTimeLabel,
  formatStepWind,
  formatTemperature,
  formatWindMax,
  pickConditions,
} from '../src/features/weather/display';

describe('pickConditions', () => {
  it('午前と午後が同じなら1つ', () => {
    expect(pickConditions({ morning: 'snow', afternoon: 'snow' })).toEqual(['snow']);
  });

  it('午前と午後が異なれば午前→午後の2つ', () => {
    expect(pickConditions({ morning: 'clear', afternoon: 'rain' })).toEqual(['clear', 'rain']);
  });

  it('片方が欠けていれば残りの1つ、両方なければ空', () => {
    expect(pickConditions({ morning: null, afternoon: 'cloudy' })).toEqual(['cloudy']);
    expect(pickConditions({ morning: 'cloudy', afternoon: null })).toEqual(['cloudy']);
    expect(pickConditions({ morning: null, afternoon: null })).toEqual([]);
  });
});

describe('formatTemperature', () => {
  it('整数に丸めて 最高/最低 で表示する', () => {
    expect(formatTemperature({ tempMaxC: 3.4, tempMinC: -4.6 })).toBe('3°/-5°');
  });

  it('-0 は 0 として表示する', () => {
    expect(formatTemperature({ tempMaxC: -0.2, tempMinC: -5 })).toBe('0°/-5°');
  });

  it('片方が null なら - で補い、両方 null なら null', () => {
    expect(formatTemperature({ tempMaxC: null, tempMinC: -5 })).toBe('-/-5°');
    expect(formatTemperature({ tempMaxC: null, tempMinC: null })).toBeNull();
  });
});

describe('formatPrecipitation / formatWindMax', () => {
  it('降水量は0.1mm単位、風は整数で単位付きにする', () => {
    expect(formatPrecipitation(1.54)).toBe('1.5mm');
    expect(formatPrecipitation(0)).toBe('0.0mm');
    expect(formatWindMax(5.6)).toBe('6m/s');
  });

  it('null は null', () => {
    expect(formatPrecipitation(null)).toBeNull();
    expect(formatWindMax(null)).toBeNull();
  });
});

describe('formatFetchedAt', () => {
  it('JST に変換して月/日 時:分で表示する', () => {
    expect(formatFetchedAt(new Date('2026-11-12T00:23:00Z'))).toBe('11/12 09:23');
  });
});

describe('formatStepTimeLabel', () => {
  // 2026-11-12 00:00 JST = 2026-11-11T15:00:00Z
  const jst = (hour: number) => new Date(Date.UTC(2026, 10, 11, 15 + hour));

  it('1時間刻みは開始時のみ（JST）', () => {
    expect(formatStepTimeLabel(jst(0), 1)).toBe('0時');
    expect(formatStepTimeLabel(jst(6), 1)).toBe('6時');
  });

  it('6時間刻みは範囲で表示し、深夜をまたぐと24時を越えた分は折り返す', () => {
    expect(formatStepTimeLabel(jst(9), 6)).toBe('9–15時');
    expect(formatStepTimeLabel(jst(21), 6)).toBe('21–3時');
    expect(formatStepTimeLabel(jst(18), 6)).toBe('18–0時');
  });
});

describe('時間別の値の整形', () => {
  it('気温は整数に丸め、null は -', () => {
    expect(formatStepTemperature(-2.6)).toBe('-3°');
    expect(formatStepTemperature(-0.1)).toBe('0°');
    expect(formatStepTemperature(null)).toBe('-');
  });

  it('降水は0.1mm単位、風は整数、null は -', () => {
    expect(formatStepPrecipitation(0.24)).toBe('0.2');
    expect(formatStepPrecipitation(null)).toBe('-');
    expect(formatStepWind(4.6)).toBe('5');
    expect(formatStepWind(null)).toBe('-');
  });
});
