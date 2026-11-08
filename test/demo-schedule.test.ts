import { describe, expect, it } from 'vitest';

import {
  buildDemoAvailabilities,
  buildDemoFrames,
  buildDemoSeasons,
  demoToday,
} from '../scripts/lib/demo-schedule';

const shiftTypes = {
  general: 'general',
  group: 'group',
  badgeTest: 'badge',
  prefectureEvent: 'event',
};

/** 指定日が含まれるシーズンの勤務枠を生成する。 */
function framesFor(today: string) {
  const date = new Date(today);
  return buildDemoSeasons(date).flatMap((season) => buildDemoFrames(season, date, shiftTypes));
}

describe('開発用demoの勤務計画', () => {
  it('日本時間の月替わりを基準にする', () => {
    expect(demoToday(new Date('2026-10-31T15:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it.each(['2026-08-31', '2026-09-01', '2028-02-29'])(
    '%sでも連続した3シーズンを通年生成する',
    (today) => {
      const frames = framesFor(today);
      const dates = new Set(frames.map((frame) => frame.date.toISOString().slice(0, 10)));
      expect(dates.has(today)).toBe(true);
      const sorted = [...dates].sort();
      expect(sorted.at(0)).toBe(
        today === '2026-08-31'
          ? '2024-09-01'
          : today === '2026-09-01'
            ? '2025-09-01'
            : '2026-09-01',
      );
      expect(sorted.at(-1)).toBe(
        today === '2026-08-31'
          ? '2027-08-31'
          : today === '2026-09-01'
            ? '2028-08-31'
            : '2029-08-31',
      );
      for (const date of dates) {
        expect(
          frames.filter(
            (frame) => frame.date.toISOString().startsWith(date) && frame.shiftTypeId === 'general',
          ),
        ).toHaveLength(2);
      }
    },
  );

  it('夏の今月にも配置済み・一部配置・未配置があり、未来月には配置しない', () => {
    const frames = framesFor('2026-07-20');
    const general = (day: string) =>
      frames.find(
        (frame) =>
          frame.date.toISOString().startsWith(day) &&
          frame.departmentCode === 'ski' &&
          frame.shiftTypeId === 'general',
      );
    expect(general('2026-06-30')?.assignmentCount).toBe(3);
    expect(general('2026-07-01')?.assignmentCount).toBe(3);
    expect(general('2026-07-02')?.assignmentCount).toBe(1);
    expect(general('2026-07-03')?.assignmentCount).toBe(0);
    expect(general('2026-08-01')?.requiredCount).toBe(5);
    expect(general('2026-08-01')?.assignmentCount).toBe(0);
    expect(
      frames
        .filter((frame) => frame.date >= new Date('2026-08-01'))
        .every((frame) => frame.assignmentCount === 0),
    ).toBe(true);
    expect(
      new Set(
        frames
          .filter((frame) => frame.date.toISOString().startsWith('2026-07'))
          .map((frame) => frame.shiftTypeId),
      ),
    ).toEqual(new Set(Object.values(shiftTypes)));
  });

  it('各月に全月未回答と後半未回答を少数含み、残りは毎日回答する', () => {
    const ids = Array.from({ length: 90 }, (_, index) => `instructor-${index}`);
    const rows = buildDemoAvailabilities(ids, [
      { startDate: new Date('2026-11-01'), endDate: new Date('2026-12-31'), label: '確認用' },
    ]);
    for (const month of ['2026-11', '2026-12']) {
      const days = month === '2026-11' ? 30 : 31;
      const counts = ids.map(
        (id) =>
          rows.filter((row) => row.instructorId === id && row.date.toISOString().startsWith(month))
            .length,
      );
      expect(counts.filter((count) => count === 0)).toHaveLength(3);
      expect(counts.filter((count) => count === 15)).toHaveLength(6);
      expect(counts.filter((count) => count === days)).toHaveLength(81);
    }
    expect(new Set(rows.map((row) => row.type))).toEqual(
      new Set(['AVAILABLE', 'AVOID', 'UNAVAILABLE']),
    );
    expect(rows.some((row) => row.note === null)).toBe(true);
    expect(rows.some((row) => row.note !== null)).toBe(true);
    expect(new Set(rows.map((row) => `${row.instructorId}/${row.date.toISOString()}`)).size).toBe(
      rows.length,
    );
  });
});
