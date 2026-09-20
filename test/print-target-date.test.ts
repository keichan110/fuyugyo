import { describe, expect, it } from 'vitest';

import { pickPrintTargetDate } from '../src/features/shifts/print-target';
import type { AgendaDateRect } from '../src/features/shifts/print-target';

/**
 * 印刷ダイアログの初期月を決める日付選択の単体テスト。
 * 固定ヘッダー下の表示領域と要素の位置だけを入力とし、DOM・React に依存せず検証する。
 */

/** 表示領域（固定ヘッダー下端 60px 〜 画面下端 800px）を前提にした選択 */
function pick(rects: AgendaDateRect[], fallbackDate: string): string {
  return pickPrintTargetDate({ rects, viewportTop: 60, viewportBottom: 800, fallbackDate });
}

describe('pickPrintTargetDate', () => {
  it('表示領域に日付が無ければ URL の日付を使う', () => {
    expect(pick([], '2026-01-15')).toBe('2026-01-15');
  });

  it('表示領域内で最も上にある日付を選ぶ', () => {
    const date = pick(
      [
        { date: '2026-01-20', top: 120, bottom: 200 },
        { date: '2026-01-21', top: 210, bottom: 290 },
      ],
      '2026-02-01',
    );

    expect(date).toBe('2026-01-20');
  });

  it('固定ヘッダーに隠れて上端がはみ出していても、一部が見えていれば最上部として選ぶ（月境界）', () => {
    // 1/31 はヘッダーに大半が隠れているが下端が見えており、2/1 より上にある
    const date = pick(
      [
        { date: '2026-01-31', top: -20, bottom: 90 },
        { date: '2026-02-01', top: 100, bottom: 180 },
      ],
      '2026-02-01',
    );

    expect(date).toBe('2026-01-31');
  });

  it('ヘッダーの裏へ完全にスクロールアウトした日付は選ばない（月境界）', () => {
    // 1/31 は下端もヘッダー下端より上にあり見えていないため、翌月の 2/1 を選ぶ
    const date = pick(
      [
        { date: '2026-01-31', top: -80, bottom: 40 },
        { date: '2026-02-01', top: 70, bottom: 150 },
      ],
      '2026-01-31',
    );

    expect(date).toBe('2026-02-01');
  });

  it('画面下端より下の日付は選ばない', () => {
    const date = pick(
      [
        { date: '2026-03-10', top: 900, bottom: 980 },
        { date: '2026-03-11', top: 1000, bottom: 1080 },
      ],
      '2026-03-01',
    );

    expect(date).toBe('2026-03-01');
  });

  it('同じ日に複数の勤務枠が並んでいてもその日付を選ぶ', () => {
    const date = pick(
      [
        { date: '2026-01-20', top: 120, bottom: 200 },
        { date: '2026-01-20', top: 200, bottom: 280 },
      ],
      '2026-02-01',
    );

    expect(date).toBe('2026-01-20');
  });

  it('同じ高さに複数の日付が並ぶ場合は日付の早い方を選ぶ', () => {
    const date = pick(
      [
        { date: '2026-02-01', top: 120, bottom: 200 },
        { date: '2026-01-31', top: 120, bottom: 200 },
      ],
      '2026-03-01',
    );

    expect(date).toBe('2026-01-31');
  });

  it('要素の並び順が日付順でなくても表示位置で判断する', () => {
    const date = pick(
      [
        { date: '2026-01-21', top: 210, bottom: 290 },
        { date: '2026-01-20', top: 120, bottom: 200 },
      ],
      '2026-02-01',
    );

    expect(date).toBe('2026-01-20');
  });
});
