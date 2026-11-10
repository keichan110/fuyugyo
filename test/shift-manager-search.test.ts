import { describe, expect, it } from 'vitest';

import { parseShiftManagerSearch } from '../src/features/shifts/manager-search';

describe('シフト管理の部門入口', () => {
  it('明示的な部門指定がなければ入口を表示する', () => {
    expect(parseShiftManagerSearch({})).toEqual({});
  });

  it.each(['ski', 'snowboard'])('有効な部門%sはURLから復元できる', (department) => {
    expect(parseShiftManagerSearch({ department })).toEqual({ department });
  });

  it.each(['', 'unknown', ['ski', 'snowboard'], null, 123].map((value) => [value]))(
    '不正な部門指定%sで別部門に入らない',
    (department) => {
      expect(parseShiftManagerSearch({ department })).toEqual({});
    },
  );

  it('部門以外のクエリを編集画面に引き継がない', () => {
    expect(parseShiftManagerSearch({ department: 'ski', unexpected: 'snowboard' })).toEqual({
      department: 'ski',
    });
  });
});
