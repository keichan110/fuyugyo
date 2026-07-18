import { describe, expect, it } from 'vitest';

import { buildSeasonStats, type SeasonStatsSourceRow } from '../src/features/shifts/season-stats';

/**
 * 「今シーズン」セクション集計純粋関数（`buildSeasonStats`）の単体テスト（DB 非依存）。
 * 集計単位が「サマリー/推移 = 勤務日数」「内訳 = 勤務回数」で異なる点を重点的に検証する。
 */

/** テスト用の集計入力行を生成するヘルパー */
function row(
  date: string,
  departmentCode: string,
  shiftTypeId: string,
  shiftTypeName = shiftTypeId,
): SeasonStatsSourceRow {
  return { date, departmentCode, shiftTypeId, shiftTypeName };
}

describe('buildSeasonStats', () => {
  it('今月・前月・今シーズン・前シーズンの勤務日数を集計する（今日=2026-01-15、シーズン=2025-09〜2026-08）', () => {
    const rows: SeasonStatsSourceRow[] = [
      row('2026-01-05', 'ski', 'st-am'), // 今月（かつ今シーズン）
      row('2025-10-03', 'ski', 'st-am'), // 今シーズンのみ（今月でも前月でもない）
      row('2025-12-20', 'ski', 'st-am'), // 前月（2025-12。かつ今シーズン）
      row('2024-12-20', 'ski', 'st-am'), // 前シーズンのみ（2024-09〜2025-08）
    ];

    const stats = buildSeasonStats(rows, '2026-01-15');

    expect(stats.summary).toEqual({
      currentMonthWorkDays: 1,
      previousMonthWorkDays: 1,
      currentSeasonWorkDays: 3,
      previousSeasonWorkDays: 1,
      currentSeasonRange: { from: '2025-09-01', to: '2026-08-31' },
      previousSeasonRange: { from: '2024-09-01', to: '2025-08-31' },
    });
  });

  it('同日に複数シフトへ入っていても勤務日数は1日として数える', () => {
    const rows: SeasonStatsSourceRow[] = [
      row('2026-01-05', 'ski', 'st-am'),
      row('2026-01-05', 'snowboard', 'st-pm'),
    ];

    const stats = buildSeasonStats(rows, '2026-01-15');

    expect(stats.summary.currentMonthWorkDays).toBe(1);
    expect(stats.summary.currentSeasonWorkDays).toBe(1);
  });

  it('部門別・シフト種別別の内訳は勤務回数（同日複数シフトはそれぞれ1件）で数える', () => {
    const rows: SeasonStatsSourceRow[] = [
      row('2026-01-05', 'ski', 'st-am', '午前'),
      row('2026-01-05', 'snowboard', 'st-pm', '午後'),
      row('2026-01-06', 'ski', 'st-am', '午前'),
    ];

    const stats = buildSeasonStats(rows, '2026-01-15');

    expect(stats.byDepartment).toEqual([
      { departmentCode: 'ski', count: 2 },
      { departmentCode: 'snowboard', count: 1 },
    ]);
    expect(stats.byShiftType).toEqual([
      { shiftTypeId: 'st-am', shiftTypeName: '午前', count: 2 },
      { shiftTypeId: 'st-pm', shiftTypeName: '午後', count: 1 },
    ]);
  });

  it('月別推移はシーズン開始月〜終了月の全12ヶ月を、データがない月も0で含めて返す', () => {
    const stats = buildSeasonStats([row('2025-10-03', 'ski', 'st-am')], '2026-01-15');

    expect(stats.monthlyTrend).toHaveLength(12);
    expect(stats.monthlyTrend[0]).toEqual({ month: '2025-09', workDays: 0 });
    expect(stats.monthlyTrend[1]).toEqual({ month: '2025-10', workDays: 1 });
    expect(stats.monthlyTrend.at(-1)).toEqual({ month: '2026-08', workDays: 0 });
  });

  it('シーズン境界の前日・当日の勤務行が正しい前シーズン/今シーズンに振り分けられる（9月カットオーバー）', () => {
    const rows: SeasonStatsSourceRow[] = [
      row('2025-08-31', 'ski', 'st-am'), // 前シーズン最終日
      row('2025-09-01', 'ski', 'st-am'), // 今シーズン初日
    ];

    const stats = buildSeasonStats(rows, '2026-01-15');

    expect(stats.summary.currentSeasonWorkDays).toBe(1);
    expect(stats.summary.previousSeasonWorkDays).toBe(1);
  });

  it('勤務実績が無ければ全項目が空/0になる', () => {
    const stats = buildSeasonStats([], '2026-01-15');

    expect(stats.summary.currentMonthWorkDays).toBe(0);
    expect(stats.summary.currentSeasonWorkDays).toBe(0);
    expect(stats.byDepartment).toEqual([]);
    expect(stats.byShiftType).toEqual([]);
    expect(stats.monthlyTrend.every((item) => item.workDays === 0)).toBe(true);
  });
});
