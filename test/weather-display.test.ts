import { describe, expect, it } from 'vitest';

import {
  formatFetchedAt,
  formatPrecipitationWind,
  formatTemperature,
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

describe('formatPrecipitationWind', () => {
  it('降水量は0.1mm単位、風は整数で表示する', () => {
    expect(formatPrecipitationWind({ precipitationMm: 1.54, windMaxMs: 5.6 })).toBe(
      '降水 1.5mm · 風 6m/s',
    );
    expect(formatPrecipitationWind({ precipitationMm: 0, windMaxMs: 2 })).toBe(
      '降水 0.0mm · 風 2m/s',
    );
  });

  it('null の項目は省き、両方 null なら null', () => {
    expect(formatPrecipitationWind({ precipitationMm: null, windMaxMs: 3 })).toBe('風 3m/s');
    expect(formatPrecipitationWind({ precipitationMm: 2, windMaxMs: null })).toBe('降水 2.0mm');
    expect(formatPrecipitationWind({ precipitationMm: null, windMaxMs: null })).toBeNull();
  });
});

describe('formatFetchedAt', () => {
  it('JST に変換して月/日 時:分で表示する', () => {
    expect(formatFetchedAt(new Date('2026-11-12T00:23:00Z'))).toBe('11/12 09:23');
  });
});
