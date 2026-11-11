import { describe, expect, it } from 'vitest';

import { seasonOptions } from '../src/features/season-analysis/season-label';
import { seasonName } from '../src/features/shifts/season';

/** シーズン名がスキー・スノーボード業界の慣習（開始年と終了年の下2桁）に沿うことを確認する。 */
describe('seasonName', () => {
  it('開始年と翌年の下2桁をハイフンでつなぐ', () => {
    expect(seasonName(2026)).toBe('26-27シーズン');
  });

  it('世紀をまたいでも下2桁を0埋めする', () => {
    expect(seasonName(2099)).toBe('99-00シーズン');
    expect(seasonName(2005)).toBe('05-06シーズン');
  });

  it('選択肢のラベルは期間を添えずシーズン名だけを出す', () => {
    expect(seasonOptions('2026-11-11', 2026)[0]).toEqual({
      value: '2026',
      label: '26-27シーズン',
    });
  });
});
