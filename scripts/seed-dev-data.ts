/**
 * ローカル開発用のマスタ・ダミーデータ投入スクリプト。
 * 旧スタック（Next.js + Prisma、`legacy/prisma/seed.ts`）にあった初期データ投入ロジックを
 * 現行の Drizzle スキーマに移植したもの。実行のたびに対象テーブルをクリアしてから再投入する。
 * 認証まわり（users / invitation_tokens）は対象外（`pnpm run db:seed:auth` で別途管理）。
 *
 * 「今シーズン」を起点に前・今・次の3シーズン分の勤務実績（シフト・アサイン・勤務可否申告）を
 * 生成する。ダッシュボードのシーズン統計（Issue #203）を実データで検証できるよう、
 * 割当は全員均等ではなく「活動度ランク」による重み付きランダムでまばらに行う。
 */
import { fakerJA as faker } from '@faker-js/faker';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import JapaneseHolidays from 'japanese-holidays';

import {
  certifications,
  instructorAvailabilities,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
} from '../src/server/db/schema.ts';
import { getLocalD1Path } from './lib/get-local-d1-path.ts';

const INSTRUCTOR_COUNT = 100;
const ACTIVE_RATIO = 0.9; // 90%がアクティブ、残り10%が休職(INACTIVE)
const DEPARTMENT_CODES = { ski: 'ski', snowboard: 'snowboard' } as const;
// シーズン開始月（1〜12）。`src/features/shifts/season.ts` の SEASON_START_MONTH と同じ値。
// このスクリプトは `node` で直接実行するため、拡張子省略の内部 import を含む src 側モジュール
// （season.ts 経由）を直接 import できず、値のみここに複製している。
const SEASON_START_MONTH = 9;

/** 配列を指定サイズごとのチャンクに分割する（SQLite のバインド変数上限対策） */
function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type Db = ReturnType<typeof drizzle>;

/** シフト種類データ（一般レッスン・団体レッスン・バッジテスト・県連事業）を投入する */
async function seedShiftTypes(db: Db) {
  const [general, group, badgeTest, prefectureEvent] = await db
    .insert(shiftTypes)
    .values([
      { name: '一般レッスン' },
      { name: '団体レッスン' },
      { name: 'バッジテスト' },
      { name: '県連事業' },
    ])
    .returning();

  if (!general || !group || !badgeTest || !prefectureEvent) {
    throw new Error('シフト種類データの作成に失敗しました');
  }

  console.log(
    `シフト種類: ${general.name}, ${group.name}, ${badgeTest.name}, ${prefectureEvent.name}`,
  );
  return { general, group, badgeTest, prefectureEvent };
}

const SKI_CERTIFICATIONS = [
  { name: '公認スキー指導員', shortName: '指導員', organization: 'SAJ' },
  { name: '公認スキー準指導員', shortName: '準指導員', organization: 'SAJ' },
  { name: '認定スキー指導員', shortName: '認定指導員', organization: 'SAS' },
  { name: '公認スキーA級検定員', shortName: 'A級検定員', organization: 'SAJ' },
  { name: '公認スキーB級検定員', shortName: 'B級検定員', organization: 'SAJ' },
  { name: '公認スキーC級検定員', shortName: 'C級検定員', organization: 'SAJ' },
];

const SNOWBOARD_CERTIFICATIONS = [
  { name: '公認スノーボード指導員', shortName: '指導員', organization: 'SAJ' },
  { name: '公認スノーボード準指導員', shortName: '準指導員', organization: 'SAJ' },
  { name: '認定スノーボード指導員', shortName: '認定指導員', organization: 'SAS' },
  { name: '公認スノーボードA級検定員', shortName: 'A級検定員', organization: 'SAJ' },
  { name: '公認スノーボードB級検定員', shortName: 'B級検定員', organization: 'SAJ' },
  { name: '公認スノーボードC級検定員', shortName: 'C級検定員', organization: 'SAJ' },
];

/** 資格データ（部門ごとに6件ずつ）を投入する */
async function seedCertifications(db: Db) {
  const skiCertifications = await db
    .insert(certifications)
    .values(
      SKI_CERTIFICATIONS.map((cert) => ({
        ...cert,
        departmentCode: DEPARTMENT_CODES.ski,
        description: '',
      })),
    )
    .returning();

  const snowboardCertifications = await db
    .insert(certifications)
    .values(
      SNOWBOARD_CERTIFICATIONS.map((cert) => ({
        ...cert,
        departmentCode: DEPARTMENT_CODES.snowboard,
        description: '',
      })),
    )
    .returning();

  console.log(
    `資格: スキー${skiCertifications.length}件, スノボ${snowboardCertifications.length}件`,
  );
  return { skiCertifications, snowboardCertifications };
}

/** インストラクターデータを作成する（90%アクティブ、10%休職） */
async function seedInstructors(db: Db) {
  const values = Array.from({ length: INSTRUCTOR_COUNT }, (_, i) => ({
    lastName: faker.person.lastName(),
    firstName: faker.person.firstName(),
    lastNameKana: 'セイ',
    firstNameKana: 'メイ',
    status: Math.random() < ACTIVE_RATIO ? 'ACTIVE' : 'INACTIVE',
    notes: `備考${i + 1}`,
  }));

  const created = await db.insert(instructors).values(values).returning();

  const activeCount = created.filter((i) => i.status === 'ACTIVE').length;
  const inactiveCount = created.filter((i) => i.status === 'INACTIVE').length;
  console.log(
    `インストラクター: ${created.length}名作成 (アクティブ${activeCount}名、休職${inactiveCount}名)`,
  );
  return created;
}

type CertRow = { id: string };

// 資格パターン定義（インデックスは SKI_CERTIFICATIONS / SNOWBOARD_CERTIFICATIONS の並びに対応）
// [0]公認指導員, [1]準指導員, [2]認定指導員, [3]A級検定員, [4]B級検定員, [5]C級検定員
type CertPattern = {
  ski?: number[];
  snowboard?: number[];
  weight: number;
};

// 両部門を担当するパターン（末尾2件）は weight 合計 12（全体260件中 約4.6%）とし、
// 「両部門担当は1割未満・基本的には専属」という運用実態に合わせている。
// 人数が100名規模のためランダム抽選のブレを考慮し、期待値を1割から余裕を持たせている。
const CERTIFICATION_PATTERNS: CertPattern[] = [
  { ski: [0, 3], weight: 24 },
  { ski: [0, 4], weight: 30 },
  { ski: [0, 5], weight: 36 },
  { ski: [0], weight: 30 },
  { ski: [1, 5], weight: 24 },
  { ski: [1], weight: 24 },
  { ski: [2], weight: 18 },
  { snowboard: [0, 3], weight: 8 },
  { snowboard: [0, 4], weight: 10 },
  { snowboard: [0, 5], weight: 12 },
  { snowboard: [0], weight: 10 },
  { snowboard: [1, 5], weight: 8 },
  { snowboard: [1], weight: 8 },
  { snowboard: [2], weight: 6 },
  { ski: [1, 5], snowboard: [2], weight: 8 },
  { ski: [2], snowboard: [2], weight: 4 },
];

/** 重み付きランダムで資格パターンを1つ選ぶ */
function selectRandomPattern(): CertPattern {
  const totalWeight = CERTIFICATION_PATTERNS.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const pattern of CERTIFICATION_PATTERNS) {
    random -= pattern.weight;
    if (random <= 0) {
      return pattern;
    }
  }
  return CERTIFICATION_PATTERNS[0]!;
}

/** 各インストラクターに資格パターンをランダムに割り当てる */
async function seedInstructorCertifications(
  db: Db,
  instructorRows: Awaited<ReturnType<typeof seedInstructors>>,
  certs: { skiCertifications: CertRow[]; snowboardCertifications: CertRow[] },
) {
  const rows: { instructorId: string; certificationId: string }[] = [];

  for (const instructor of instructorRows) {
    const pattern = selectRandomPattern();
    for (const idx of pattern.ski ?? []) {
      const cert = certs.skiCertifications[idx];
      if (cert) rows.push({ instructorId: instructor.id, certificationId: cert.id });
    }
    for (const idx of pattern.snowboard ?? []) {
      const cert = certs.snowboardCertifications[idx];
      if (cert) rows.push({ instructorId: instructor.id, certificationId: cert.id });
    }
  }

  for (const batch of chunk(rows, 100)) {
    await db.insert(instructorCertifications).values(batch);
  }

  console.log(`インストラクター資格関連: ${rows.length}件作成完了`);
  return rows;
}

type ShiftSeed = { id: string; date: Date; departmentCode: string; shiftTypeId: string };

/** シーズン単位のシフト生成仕様（12/1 startYear 〜 endDate） */
type SeasonSpec = { startYear: number; endDate: Date; label: string };

/** シーズンラベル（例: 2025-26）を返す */
function formatSeasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * 実行日を基準に「前・今・次」3シーズン分の生成仕様を返す。
 * ダッシュボードのシーズン統計（9月始まり〜翌8月）に対する「今シーズン」を実行日から求め、
 * その前後1シーズンずつを加えた3シーズン分を対象にする。前・今シーズンは完全な期間
 * （12/1〜翌3/31）、次シーズンは進行中を模した部分データ（12/1〜翌2/20）として打ち切る。
 */
function buildSeasonSpecs(): SeasonSpec[] {
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  // シーズン開始月（9月）より前なら、今シーズンの開始年は前年
  const anchorStartYear = currentMonth >= SEASON_START_MONTH ? currentYear : currentYear - 1;

  const fullSeasonEnd = (startYear: number) =>
    new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));

  return [
    {
      startYear: anchorStartYear - 1,
      endDate: fullSeasonEnd(anchorStartYear - 1),
      label: `${formatSeasonLabel(anchorStartYear - 1)}（前シーズン）`,
    },
    {
      startYear: anchorStartYear,
      endDate: fullSeasonEnd(anchorStartYear),
      label: `${formatSeasonLabel(anchorStartYear)}（今シーズン）`,
    },
    {
      startYear: anchorStartYear + 1,
      // 次シーズンは 2/20 で打ち切り、シーズン進行中の見た目にする
      endDate: new Date(Date.UTC(anchorStartYear + 2, 1, 20, 23, 59, 59, 999)),
      label: `${formatSeasonLabel(anchorStartYear + 1)}（次シーズン・進行中）`,
    },
  ];
}

/** 指定年月内で「第n週の指定曜日」に該当する日付（YYYY-MM-DD）を列挙する */
function collectNthWeekdayDates(
  year: number,
  month: number,
  weeks: number[],
  dayOfWeek: number,
): string[] {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(year, month, d));
    const week = Math.ceil(d / 7);
    if (weeks.includes(week) && date.getUTCDay() === dayOfWeek) {
      dates.push(date.toISOString().split('T')[0]!);
    }
  }
  return dates;
}

/**
 * 1シーズン分（12/1 startYear 〜 endDate）のシフト投入用データを組み立てる。
 * 平日はスキー一般レッスンのみ、週末・祝日はスキー＋スノーボード一般レッスンに加え、
 * 翌年1・2月の特定日に団体レッスン・バッジテスト・県連事業を配置する。
 */
function buildSeasonShiftValues(
  startYear: number,
  endDate: Date,
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): { date: Date; departmentCode: string; shiftTypeId: string; description: string }[] {
  const startDate = new Date(Date.UTC(startYear, 11, 1));
  const eventYear = startYear + 1;

  // 1月の団体レッスン日（第2土曜日）
  const groupLessonDates = collectNthWeekdayDates(eventYear, 0, [2], 6);
  // バッジテスト日（1月・2月の第2・第4土曜日）
  const badgeTestDates = [
    ...collectNthWeekdayDates(eventYear, 0, [2, 4], 6),
    ...collectNthWeekdayDates(eventYear, 1, [2, 4], 6),
  ];
  // 県連事業日（1月・2月の第1・第3日曜日）
  const prefectureEventDates = [
    ...collectNthWeekdayDates(eventYear, 0, [1, 3], 0),
    ...collectNthWeekdayDates(eventYear, 1, [1, 3], 0),
  ];

  const values: { date: Date; departmentCode: string; shiftTypeId: string; description: string }[] =
    [];

  for (
    const current = new Date(startDate);
    current <= endDate;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const dateString = current.toISOString().split('T')[0]!;
    const checkDate = new Date(`${dateString}T00:00:00Z`);
    const dayOfWeek = checkDate.getUTCDay();
    const isWeekendOrHoliday =
      dayOfWeek === 0 || dayOfWeek === 6 || !!JapaneseHolidays.isHoliday(checkDate);

    if (isWeekendOrHoliday) {
      values.push({
        date: checkDate,
        departmentCode: DEPARTMENT_CODES.ski,
        shiftTypeId: shiftTypeIds.general,
        description: 'スキー一般レッスン',
      });
      values.push({
        date: checkDate,
        departmentCode: DEPARTMENT_CODES.snowboard,
        shiftTypeId: shiftTypeIds.general,
        description: 'スノーボード一般レッスン',
      });

      if (groupLessonDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentCode: DEPARTMENT_CODES.ski,
          shiftTypeId: shiftTypeIds.group,
          description: 'スキー団体レッスン',
        });
        values.push({
          date: checkDate,
          departmentCode: DEPARTMENT_CODES.snowboard,
          shiftTypeId: shiftTypeIds.group,
          description: 'スノーボード団体レッスン',
        });
      }

      if (badgeTestDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentCode: DEPARTMENT_CODES.ski,
          shiftTypeId: shiftTypeIds.badgeTest,
          description: 'スキーバッジテスト',
        });
      }

      if (prefectureEventDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentCode: DEPARTMENT_CODES.snowboard,
          shiftTypeId: shiftTypeIds.prefectureEvent,
          description: '県連事業',
        });
      }
    } else {
      values.push({
        date: checkDate,
        departmentCode: DEPARTMENT_CODES.ski,
        shiftTypeId: shiftTypeIds.general,
        description: 'スキー一般レッスン',
      });
    }
  }

  return values;
}

/** シーズン単位で生成されたシフト行のまとまり */
type SeasonShiftGroup = { label: string; shifts: ShiftSeed[] };

/** 前・今・次の3シーズン分のシフトデータを作成する */
async function seedShifts(
  db: Db,
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): Promise<SeasonShiftGroup[]> {
  const specs = buildSeasonSpecs();
  const groups: SeasonShiftGroup[] = [];

  for (const spec of specs) {
    const values = buildSeasonShiftValues(spec.startYear, spec.endDate, shiftTypeIds);

    const created: ShiftSeed[] = [];
    for (const batch of chunk(values, 50)) {
      const rows = await db.insert(shifts).values(batch).returning();
      created.push(...rows);
    }

    const weekendCount = created.filter((s) => {
      const day = s.date.getUTCDay();
      return day === 0 || day === 6;
    }).length;
    console.log(
      `  [${spec.label}] シフト: ${created.length}件作成 (平日${created.length - weekendCount}件、土日${weekendCount}件)`,
    );
    groups.push({ label: spec.label, shifts: created });
  }

  const total = groups.reduce((sum, g) => sum + g.shifts.length, 0);
  console.log(`シフト合計: ${total}件作成`);
  return groups;
}

/** シフト種類・日付・部門ごとの必要人数を返す */
function getRequiredInstructorCount(
  shift: ShiftSeed,
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): number {
  const dayOfWeek = shift.date.getUTCDay();
  const isWeekendOrHoliday =
    dayOfWeek === 0 || dayOfWeek === 6 || !!JapaneseHolidays.isHoliday(shift.date);

  if (shift.departmentCode === DEPARTMENT_CODES.ski && shift.shiftTypeId === shiftTypeIds.general) {
    return isWeekendOrHoliday ? 5 : 3;
  }
  if (
    shift.departmentCode === DEPARTMENT_CODES.snowboard &&
    shift.shiftTypeId === shiftTypeIds.general
  ) {
    return 3;
  }
  if (shift.shiftTypeId === shiftTypeIds.badgeTest) {
    return 3;
  }
  if (shift.shiftTypeId === shiftTypeIds.group) {
    return Math.floor(Math.random() * 3) + 2; // 2〜4
  }
  if (shift.shiftTypeId === shiftTypeIds.prefectureEvent) {
    return Math.floor(Math.random() * 2) + 1; // 1〜2
  }
  return 1;
}

/** 活動度ランク（勤務頻度の傾向）。シーズンごとに ACTIVE 各人へ重み付き抽選で割り当てる */
const ACTIVITY_RANKS = [
  { name: '常連', probability: 0.15, sampleWeight: 8 },
  { name: '一般', probability: 0.45, sampleWeight: 3 },
  { name: 'たまに', probability: 0.3, sampleWeight: 1 },
  { name: 'ほぼ休', probability: 0.1, sampleWeight: 0.2 },
] as const;

/** 累積確率で活動度ランクを1つ選ぶ */
function pickActivityRank(): (typeof ACTIVITY_RANKS)[number] {
  let random = Math.random();
  for (const rank of ACTIVITY_RANKS) {
    if (random < rank.probability) {
      return rank;
    }
    random -= rank.probability;
  }
  return ACTIVITY_RANKS[ACTIVITY_RANKS.length - 1];
}

/**
 * シーズンごとに ACTIVE 各インストラクターへ活動度（サンプリング重み）を抽選する。
 * シーズンをまたいで再抽選するため、同じ人でもシーズンにより勤務頻度に濃淡が出る
 * （「常連」だったシーズンの翌年に「たまに」になる、等）。
 */
function assignSeasonActivityWeights(activeInstructors: { id: string }[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const instructor of activeInstructors) {
    weights.set(instructor.id, pickActivityRank().sampleWeight);
  }
  return weights;
}

/**
 * 重み付きランダムで、プールから指定件数を重複なく抽選する（アサインなしを除外可能）。
 * 必要人数に対してプールが不足している場合は、可能な範囲まで埋めて打ち切る。
 */
function pickWeightedWithoutReplacement(
  pool: { id: string; weight: number }[],
  count: number,
  exclude: Set<string>,
): string[] {
  const remaining = pool.filter((p) => !exclude.has(p.id));
  const picked: string[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight <= 0) break;

    let cursor = Math.random() * totalWeight;
    let index = 0;
    for (; index < remaining.length - 1; index++) {
      cursor -= remaining[index]!.weight;
      if (cursor <= 0) break;
    }

    picked.push(remaining[index]!.id);
    remaining.splice(index, 1);
  }

  return picked;
}

/**
 * アクティブなインストラクターをシフトに割り当てる（1日1シフトまで、部門の資格保持者のみ）。
 * シーズンごとに活動度ランクを再抽選し、その重みに応じた weighted-random で割当先を選ぶことで、
 * 「よく働く人・たまにの人・ほぼ休みの人」がシーズンをまたいで自然に混ざるようにする。
 * 戻り値は最後（＝最新）のシーズンの Instructor 別割当済み日。可否申告の候補日から
 * 除外するために `seedInstructorAvailabilities` へ渡す。
 */
async function seedShiftAssignments(
  db: Db,
  seasonGroups: SeasonShiftGroup[],
  instructorRows: Awaited<ReturnType<typeof seedInstructors>>,
  instructorCertRows: { instructorId: string; certificationId: string }[],
  certs: { skiCertifications: CertRow[]; snowboardCertifications: CertRow[] },
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): Promise<Map<string, Set<string>>> {
  const activeInstructors = instructorRows.filter((i) => i.status === 'ACTIVE');

  const skiCertIds = new Set(certs.skiCertifications.map((c) => c.id));
  const snowboardCertIds = new Set(certs.snowboardCertifications.map((c) => c.id));

  const skiInstructorIds = new Set<string>();
  const snowboardInstructorIds = new Set<string>();
  for (const ic of instructorCertRows) {
    if (skiCertIds.has(ic.certificationId)) skiInstructorIds.add(ic.instructorId);
    if (snowboardCertIds.has(ic.certificationId)) snowboardInstructorIds.add(ic.instructorId);
  }

  const skiInstructors = activeInstructors.filter((i) => skiInstructorIds.has(i.id));
  const snowboardInstructors = activeInstructors.filter((i) => snowboardInstructorIds.has(i.id));

  let totalAssignments = 0;
  // 最後（＝最新）のシーズンの Instructor 別割当済み日。ループの度に上書きされ、
  // 最終的に `seasonGroups` の最後の要素（次シーズン）分だけが残る。
  let lastSeasonAssignedDates = new Map<string, Set<string>>();

  for (const season of seasonGroups) {
    const activityWeight = assignSeasonActivityWeights(activeInstructors);
    const skiPool = skiInstructors.map((i) => ({
      id: i.id,
      weight: activityWeight.get(i.id) ?? 0.1,
    }));
    const snowboardPool = snowboardInstructors.map((i) => ({
      id: i.id,
      weight: activityWeight.get(i.id) ?? 0.1,
    }));

    const shiftsByDate = new Map<string, ShiftSeed[]>();
    for (const shift of season.shifts) {
      const dateString = shift.date.toISOString().split('T')[0]!;
      const list = shiftsByDate.get(dateString) ?? [];
      list.push(shift);
      shiftsByDate.set(dateString, list);
    }

    const assignments: { shiftId: string; instructorId: string }[] = [];
    const assignedDatesByInstructor = new Map<string, Set<string>>();

    for (const [dateString, dateShifts] of shiftsByDate) {
      const assignedToday = new Set<string>();

      for (const shift of dateShifts) {
        const requiredCount = getRequiredInstructorCount(shift, shiftTypeIds);
        const pool = shift.departmentCode === DEPARTMENT_CODES.ski ? skiPool : snowboardPool;
        if (pool.length === 0) continue;

        const assigned = pickWeightedWithoutReplacement(pool, requiredCount, assignedToday);
        for (const instructorId of assigned) {
          assignedToday.add(instructorId);
          assignments.push({ shiftId: shift.id, instructorId });

          const dates = assignedDatesByInstructor.get(instructorId) ?? new Set<string>();
          dates.add(dateString);
          assignedDatesByInstructor.set(instructorId, dates);
        }
      }
    }

    for (const batch of chunk(assignments, 100)) {
      await db.insert(shiftAssignments).values(batch);
    }

    totalAssignments += assignments.length;
    console.log(`  [${season.label}] シフトアサイン: ${assignments.length}件`);
    lastSeasonAssignedDates = assignedDatesByInstructor;
  }

  console.log(`シフトアサイン合計: ${totalAssignments}件作成`);
  console.log(`   - スキー担当: ${skiInstructors.length}名`);
  console.log(`   - スノーボード担当: ${snowboardInstructors.length}名`);

  return lastSeasonAssignedDates;
}

/** 勤務可否申告に使う中立的な理由メモ（「休み」系の表現は避ける） */
const AVAILABILITY_NOTES = ['所用のため', '他業務のため', '通院のため', '研修参加のため'];

/**
 * 次シーズン（進行中）の未来日に対し、ACTIVE の一部インストラクターへ
 * 勤務可否申告（UNAVAILABLE/AVOID）をまばらに投入する。
 * デフォルト勤務可・例外のみ申告という opt-out 設計に合わせ、対象は一部の人・一部の日のみ。
 * 既にシフト割当済みの日は、申告と割当が同日に矛盾して存在しないよう候補から除外する。
 */
async function seedInstructorAvailabilities(
  db: Db,
  instructorRows: Awaited<ReturnType<typeof seedInstructors>>,
  nextSeasonShifts: ShiftSeed[],
  assignedDatesByInstructor: Map<string, Set<string>>,
) {
  const activeInstructors = instructorRows.filter((i) => i.status === 'ACTIVE');

  // 対象日は次シーズンのシフトが存在する日付（重複除去）
  const candidateDates = [
    ...new Set(nextSeasonShifts.map((s) => s.date.toISOString().split('T')[0]!)),
  ];
  if (candidateDates.length === 0) {
    console.log('勤務可否申告: 次シーズンのシフトが無いためスキップ');
    return;
  }

  // ACTIVE の 2〜3割にだけ申告を付与する
  const declaringInstructors = activeInstructors.filter(() => Math.random() < 0.25);

  const rows: { instructorId: string; date: Date; type: 'UNAVAILABLE' | 'AVOID'; note: string }[] =
    [];
  let skippedNoCandidateCount = 0;

  for (const instructor of declaringInstructors) {
    // 既にシフト割当済みの日を除外してから申告日を選ぶ（割当と申告が同日に矛盾しないように）
    const assignedDates = assignedDatesByInstructor.get(instructor.id) ?? new Set<string>();
    const availableCandidates = candidateDates.filter((d) => !assignedDates.has(d));
    if (availableCandidates.length === 0) {
      skippedNoCandidateCount++;
      continue;
    }

    // 1人あたり1〜3日、重複なく申告日を選ぶ
    const dayCount = Math.min(Math.floor(Math.random() * 3) + 1, availableCandidates.length);
    const shuffled = [...availableCandidates].sort(() => Math.random() - 0.5);
    const pickedDates = shuffled.slice(0, dayCount);

    for (const dateString of pickedDates) {
      rows.push({
        instructorId: instructor.id,
        date: new Date(`${dateString}T00:00:00Z`),
        type: Math.random() < 0.5 ? 'UNAVAILABLE' : 'AVOID',
        note: AVAILABILITY_NOTES[Math.floor(Math.random() * AVAILABILITY_NOTES.length)]!,
      });
    }
  }

  for (const batch of chunk(rows, 100)) {
    await db.insert(instructorAvailabilities).values(batch);
  }

  console.log(
    `勤務可否申告: ${rows.length}件作成 (対象${declaringInstructors.length}名、全日割当済みで対象外${skippedNoCandidateCount}名)`,
  );
}

/** 業務データ（シフト種類・資格・インストラクター・シフト・アサイン・勤務可否申告）を全クリアする */
async function clearExistingData(db: Db) {
  console.log('既存データをクリア中...');
  await db.delete(instructorAvailabilities);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(instructorCertifications);
  await db.delete(instructors);
  await db.delete(certifications);
  await db.delete(shiftTypes);
  console.log('既存データのクリア完了\n');
}

async function main() {
  const client = createClient({ url: `file:${getLocalD1Path()}` });
  try {
    const db = drizzle(client);

    console.log('スキー・スノーボードスクール 初期データ投入開始...\n');

    await clearExistingData(db);

    const shiftTypeRows = await seedShiftTypes(db);
    const shiftTypeIds = {
      general: shiftTypeRows.general.id,
      group: shiftTypeRows.group.id,
      badgeTest: shiftTypeRows.badgeTest.id,
      prefectureEvent: shiftTypeRows.prefectureEvent.id,
    };

    const certs = await seedCertifications(db);
    const instructorRows = await seedInstructors(db);
    const instructorCertRows = await seedInstructorCertifications(db, instructorRows, certs);

    const seasonGroups = await seedShifts(db, shiftTypeIds);
    const nextSeasonAssignedDates = await seedShiftAssignments(
      db,
      seasonGroups,
      instructorRows,
      instructorCertRows,
      certs,
      shiftTypeIds,
    );

    const nextSeason = seasonGroups[seasonGroups.length - 1];
    if (nextSeason) {
      await seedInstructorAvailabilities(
        db,
        instructorRows,
        nextSeason.shifts,
        nextSeasonAssignedDates,
      );
    }

    console.log('\n初期データ投入完了！');
  } finally {
    client.close();
  }
}

main().catch((e: unknown) => {
  console.error('シードデータ投入エラー:', e);
  process.exit(1);
});
