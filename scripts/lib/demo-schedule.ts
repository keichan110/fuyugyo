/** 開発用データを生成するシーズン。期間は9月から翌8月まで。 */
export type DemoSeason = { startDate: Date; endDate: Date; label: string };

/** 日付ごとに生成する勤務枠と必要人数。 */
export type DemoFrame = {
  date: Date;
  departmentCode: 'ski' | 'snowboard';
  shiftTypeId: string;
  description: string;
  requiredCount: number;
  assignmentCount: number;
};

/** デモに使用する既存のシフト種別ID。 */
export type DemoShiftTypeIds = {
  general: string;
  group: string;
  badgeTest: string;
  prefectureEvent: string;
};

/** デモ用の勤務可用性申告。未入力は行を生成しない。 */
export type DemoAvailability = {
  instructorId: string;
  date: Date;
  type: 'AVAILABLE' | 'AVOID' | 'UNAVAILABLE';
  note: string | null;
};

const demoDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });

/** 日本時間の今日を、DBの日付表現に合わせたUTC午前0時で返す。 */
export function demoToday(now = new Date()): Date {
  const date = demoDateFormatter.format(now);
  return new Date(`${date}T00:00:00Z`);
}

/** 季節によらず前・今・次の3シーズンを丸ごと生成する。 */
export function buildDemoSeasons(today: Date): DemoSeason[] {
  const year = today.getUTCFullYear() - (today.getUTCMonth() < 8 ? 1 : 0);
  return [-1, 0, 1].map((offset) => {
    const startYear = year + offset;
    const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
    return {
      startDate: new Date(Date.UTC(startYear, 8, 1)),
      endDate: new Date(Date.UTC(startYear + 1, 7, 31)),
      label: `${label}（${offset < 0 ? '前' : offset === 0 ? '今' : '次'}シーズン）`,
    };
  });
}

/**
 * 通年の勤務枠を生成する。過去月は配置済み、今月は日ごとに配置済み・一部配置・未配置、
 * 未来月は未配置とし、必要人数はシフトの有無と独立して保持する。
 */
export function buildDemoFrames(
  season: DemoSeason,
  today: Date,
  ids: DemoShiftTypeIds,
): DemoFrame[] {
  const frames: DemoFrame[] = [];
  const currentMonth = today.toISOString().slice(0, 7);
  for (
    const date = new Date(season.startDate);
    date <= season.endDate;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.getUTCDate();
    const weekday = date.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const month = date.toISOString().slice(0, 7);
    // 当月は日付を3日周期にし、実行日やランダム抽選によらず全状態を確認できる。
    const ratio = month < currentMonth ? 1 : month > currentMonth ? 0 : ([0, 1, 0.5][day % 3] ?? 0);
    const add = (
      departmentCode: DemoFrame['departmentCode'],
      shiftTypeId: string,
      name: string,
      requiredCount: number,
    ) => {
      frames.push({
        date: new Date(date),
        departmentCode,
        shiftTypeId,
        description: `${departmentCode === 'ski' ? 'スキー' : 'スノーボード'}${name}`,
        requiredCount,
        assignmentCount: Math.floor(requiredCount * ratio),
      });
    };
    add('ski', ids.general, '一般レッスン', weekend ? 5 : 3);
    add('snowboard', ids.general, '一般レッスン', 3);
    if (weekday === 6) {
      add('ski', ids.group, '団体レッスン', 3);
      add('snowboard', ids.group, '団体レッスン', 2);
      if (day >= 8 && day <= 14) add('ski', ids.badgeTest, 'バッジテスト', 3);
    }
    if (weekday === 0 && day <= 7) {
      add('snowboard', ids.prefectureEvent, '県連事業', 2);
    }
  }
  return frames;
}

/**
 * 月単位で通常回答90%・後半未回答7%・全月未回答3%の申告を生成する。
 * 回答済みの日は勤務可を中心に3状態を混ぜ、理由あり・なしを含める。
 * 人と月の組み合わせでパターンを変え、少人数でも未回答を確認できるようにする。
 */
export function buildDemoAvailabilities(
  instructorIds: string[],
  seasons: DemoSeason[],
): DemoAvailability[] {
  const notes = ['所用のため', '他業務のため', '通院のため', '研修参加のため'];
  const rows: DemoAvailability[] = [];
  for (const season of seasons) {
    for (
      const date = new Date(season.startDate);
      date <= season.endDate;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
      for (const [index, instructorId] of instructorIds.entries()) {
        const pattern = (index + month) % instructorIds.length;
        const unansweredCount = Math.max(1, Math.round(instructorIds.length * 0.03));
        const partialCount = Math.max(1, Math.round(instructorIds.length * 0.07));
        if (
          pattern < unansweredCount ||
          (pattern < unansweredCount + partialCount && date.getUTCDate() > 15)
        )
          continue;
        // 勤務可70%・要調整15%・勤務不可15%。割当前に生成して勤務不可との矛盾を防ぐ。
        const roll = Math.random();
        const type = roll < 0.7 ? 'AVAILABLE' : roll < 0.85 ? 'AVOID' : 'UNAVAILABLE';
        const note =
          Math.random() < 0.5
            ? null
            : type === 'AVAILABLE'
              ? '終日対応できます'
              : (notes[Math.floor(Math.random() * notes.length)] ?? null);
        rows.push({ instructorId, date: new Date(date), type, note });
      }
    }
  }
  return rows;
}
