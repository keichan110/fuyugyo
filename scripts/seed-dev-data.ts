/**
 * ローカル開発用のマスタ・ダミーデータ投入スクリプト。
 * 旧スタック（Next.js + Prisma、`legacy/prisma/seed.ts`）にあった初期データ投入ロジックを
 * 現行の Drizzle スキーマに移植したもの。実行のたびに対象テーブルをクリアしてから再投入する。
 * 認証まわり（users / invitation_tokens）は対象外（`pnpm run db:seed` で別途管理）。
 */
import { fakerJA as faker } from '@faker-js/faker';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import JapaneseHolidays from 'japanese-holidays';

import {
  certifications,
  departments,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
} from '../src/server/db/schema.ts';
import { getLocalD1Path } from './lib/get-local-d1-path.ts';

const INSTRUCTOR_COUNT = 70;
const ACTIVE_RATIO = 0.9; // 90%がアクティブ、残り10%が休職(INACTIVE)

/** 配列を指定サイズごとのチャンクに分割する（SQLite のバインド変数上限対策） */
function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type Db = ReturnType<typeof drizzle>;

/** 部門データ（スキー・スノーボード）を投入する */
async function seedDepartments(db: Db) {
  const [ski, snowboard] = await db
    .insert(departments)
    .values([
      { code: 'ski', name: 'スキー', description: 'スキー部門' },
      { code: 'snowboard', name: 'スノーボード', description: 'スノーボード部門' },
    ])
    .returning();

  if (!ski || !snowboard) {
    throw new Error('部門データの作成に失敗しました');
  }

  console.log(`部門: ${ski.name}, ${snowboard.name}`);
  return { ski, snowboard };
}

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
async function seedCertifications(db: Db, departmentIds: { ski: string; snowboard: string }) {
  const skiCertifications = await db
    .insert(certifications)
    .values(
      SKI_CERTIFICATIONS.map((cert) => ({
        ...cert,
        departmentId: departmentIds.ski,
        description: '',
      })),
    )
    .returning();

  const snowboardCertifications = await db
    .insert(certifications)
    .values(
      SNOWBOARD_CERTIFICATIONS.map((cert) => ({
        ...cert,
        departmentId: departmentIds.snowboard,
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
  { ski: [1, 5], snowboard: [2], weight: 2 },
  { ski: [2], snowboard: [2], weight: 1 },
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

type ShiftSeed = { id: string; date: Date; departmentId: string; shiftTypeId: string };

/** 当年12月1日〜翌年3月31日の期間でシフトデータを作成する */
async function seedShifts(
  db: Db,
  departmentIds: { ski: string; snowboard: string },
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): Promise<ShiftSeed[]> {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(Date.UTC(currentYear, 11, 1));
  const endDate = new Date(Date.UTC(currentYear + 1, 2, 31, 23, 59, 59, 999));

  // 1月の団体レッスン日（第2土曜日）
  const groupLessonDates: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(currentYear + 1, 0, d));
    if (Math.ceil(d / 7) === 2 && date.getUTCDay() === 6) {
      groupLessonDates.push(date.toISOString().split('T')[0]!);
      break;
    }
  }

  // バッジテスト日（1月・2月の第2・第4土曜日）
  const badgeTestDates: string[] = [];
  for (const [year, month] of [
    [currentYear + 1, 0],
    [currentYear + 1, 1],
  ] as const) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(Date.UTC(year, month, d));
      const week = Math.ceil(d / 7);
      if ((week === 2 || week === 4) && date.getUTCDay() === 6) {
        badgeTestDates.push(date.toISOString().split('T')[0]!);
      }
    }
  }

  // 県連事業日（1月・2月の第1・第3日曜日）
  const prefectureEventDates: string[] = [];
  for (const [year, month] of [
    [currentYear + 1, 0],
    [currentYear + 1, 1],
  ] as const) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(Date.UTC(year, month, d));
      const week = Math.ceil(d / 7);
      if ((week === 1 || week === 3) && date.getUTCDay() === 0) {
        prefectureEventDates.push(date.toISOString().split('T')[0]!);
      }
    }
  }

  const values: { date: Date; departmentId: string; shiftTypeId: string; description: string }[] =
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
        departmentId: departmentIds.ski,
        shiftTypeId: shiftTypeIds.general,
        description: 'スキー一般レッスン',
      });
      values.push({
        date: checkDate,
        departmentId: departmentIds.snowboard,
        shiftTypeId: shiftTypeIds.general,
        description: 'スノーボード一般レッスン',
      });

      if (groupLessonDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentId: departmentIds.ski,
          shiftTypeId: shiftTypeIds.group,
          description: 'スキー団体レッスン',
        });
        values.push({
          date: checkDate,
          departmentId: departmentIds.snowboard,
          shiftTypeId: shiftTypeIds.group,
          description: 'スノーボード団体レッスン',
        });
      }

      if (badgeTestDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentId: departmentIds.ski,
          shiftTypeId: shiftTypeIds.badgeTest,
          description: 'スキーバッジテスト',
        });
      }

      if (prefectureEventDates.includes(dateString)) {
        values.push({
          date: checkDate,
          departmentId: departmentIds.snowboard,
          shiftTypeId: shiftTypeIds.prefectureEvent,
          description: '県連事業',
        });
      }
    } else {
      values.push({
        date: checkDate,
        departmentId: departmentIds.ski,
        shiftTypeId: shiftTypeIds.general,
        description: 'スキー一般レッスン',
      });
    }
  }

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
    `シフト: ${created.length}件作成 (平日${created.length - weekendCount}件、土日${weekendCount}件)`,
  );
  return created;
}

/** シフト種類・日付・部門ごとの必要人数を返す */
function getRequiredInstructorCount(
  shift: ShiftSeed,
  departmentIds: { ski: string; snowboard: string },
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
): number {
  const dayOfWeek = shift.date.getUTCDay();
  const isWeekendOrHoliday =
    dayOfWeek === 0 || dayOfWeek === 6 || !!JapaneseHolidays.isHoliday(shift.date);

  if (shift.departmentId === departmentIds.ski && shift.shiftTypeId === shiftTypeIds.general) {
    return isWeekendOrHoliday ? 5 : 3;
  }
  if (
    shift.departmentId === departmentIds.snowboard &&
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

/** アクティブなインストラクターをシフトに割り当てる（1日1シフトまで、部門の資格保持者のみ） */
async function seedShiftAssignments(
  db: Db,
  shiftRows: ShiftSeed[],
  instructorRows: Awaited<ReturnType<typeof seedInstructors>>,
  instructorCertRows: { instructorId: string; certificationId: string }[],
  certs: { skiCertifications: CertRow[]; snowboardCertifications: CertRow[] },
  departmentIds: { ski: string; snowboard: string },
  shiftTypeIds: { general: string; group: string; badgeTest: string; prefectureEvent: string },
) {
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

  const shiftsByDate = new Map<string, ShiftSeed[]>();
  for (const shift of shiftRows) {
    const dateString = shift.date.toISOString().split('T')[0]!;
    const list = shiftsByDate.get(dateString) ?? [];
    list.push(shift);
    shiftsByDate.set(dateString, list);
  }

  const assignments: { shiftId: string; instructorId: string }[] = [];
  let skiIndex = 0;
  let snowboardIndex = 0;

  for (const dateShifts of shiftsByDate.values()) {
    const assignedToday = new Set<string>();

    for (const shift of dateShifts) {
      const requiredCount = getRequiredInstructorCount(shift, departmentIds, shiftTypeIds);
      const pool = shift.departmentId === departmentIds.ski ? skiInstructors : snowboardInstructors;
      if (pool.length === 0) continue;

      const assigned: string[] = [];
      let attempts = 0;
      const maxAttempts = pool.length * 2;

      while (assigned.length < requiredCount && attempts < maxAttempts) {
        const instructor =
          shift.departmentId === departmentIds.ski
            ? pool[skiIndex++ % pool.length]!
            : pool[snowboardIndex++ % pool.length]!;
        attempts++;

        if (assigned.includes(instructor.id) || assignedToday.has(instructor.id)) {
          continue;
        }
        assigned.push(instructor.id);
        assignedToday.add(instructor.id);
      }

      for (const instructorId of assigned) {
        assignments.push({ shiftId: shift.id, instructorId });
      }
    }
  }

  for (const batch of chunk(assignments, 100)) {
    await db.insert(shiftAssignments).values(batch);
  }

  console.log(`シフトアサイン: ${assignments.length}件作成`);
  console.log(`   - スキー担当: ${skiInstructors.length}名`);
  console.log(`   - スノーボード担当: ${snowboardInstructors.length}名`);
}

/** 業務データ（部門・シフト種類・資格・インストラクター・シフト・アサイン）を全クリアする */
async function clearExistingData(db: Db) {
  console.log('既存データをクリア中...');
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(instructorCertifications);
  await db.delete(instructors);
  await db.delete(certifications);
  await db.delete(shiftTypes);
  await db.delete(departments);
  console.log('既存データのクリア完了\n');
}

async function main() {
  const client = createClient({ url: `file:${getLocalD1Path()}` });
  const db = drizzle(client);

  console.log('スキー・スノーボードスクール 初期データ投入開始...\n');

  await clearExistingData(db);

  const departmentRows = await seedDepartments(db);
  const departmentIds = { ski: departmentRows.ski.id, snowboard: departmentRows.snowboard.id };

  const shiftTypeRows = await seedShiftTypes(db);
  const shiftTypeIds = {
    general: shiftTypeRows.general.id,
    group: shiftTypeRows.group.id,
    badgeTest: shiftTypeRows.badgeTest.id,
    prefectureEvent: shiftTypeRows.prefectureEvent.id,
  };

  const certs = await seedCertifications(db, departmentIds);
  const instructorRows = await seedInstructors(db);
  const instructorCertRows = await seedInstructorCertifications(db, instructorRows, certs);

  const shiftRows = await seedShifts(db, departmentIds, shiftTypeIds);
  await seedShiftAssignments(
    db,
    shiftRows,
    instructorRows,
    instructorCertRows,
    certs,
    departmentIds,
    shiftTypeIds,
  );

  console.log('\n初期データ投入完了！');
}

main().catch((e: unknown) => {
  console.error('シードデータ投入エラー:', e);
  process.exit(1);
});
