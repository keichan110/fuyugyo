import { describe, expect, it } from 'vitest';

import {
  buildSeasonWorkDaysChartData,
  formatSeasonWorkDaysTooltip,
} from '../src/features/dashboard/components/season-work-days-chart-data';

describe('buildSeasonWorkDaysChartData', () => {
  it('月別勤務日数とその月までの累積勤務日数を同じ月順で返す', () => {
    expect(
      buildSeasonWorkDaysChartData([
        { month: '2025-09', workDays: 2 },
        { month: '2025-10', workDays: 0 },
        { month: '2025-11', workDays: 3 },
      ]),
    ).toEqual([
      { month: '9月', workDays: 2, totalWorkDays: 2 },
      { month: '10月', workDays: 0, totalWorkDays: 2 },
      { month: '11月', workDays: 3, totalWorkDays: 5 },
    ]);
  });

  it('ツールチップを月別勤務日数と通算勤務日数の対として表示する', () => {
    expect(formatSeasonWorkDaysTooltip('1月', 12, 34)).toBe('1月 12日 / 通算34日');
  });
});
