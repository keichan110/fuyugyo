import { describe, expect, it } from 'vitest';

import {
  formatFetchedAt,
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

describe('formatFetchedAt', () => {
  it('JST に変換して月/日 時:分で表示する', () => {
    expect(formatFetchedAt(new Date('2026-11-12T00:23:00Z'))).toBe('11/12 09:23');
  });
});
