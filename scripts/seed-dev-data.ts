/**
 * ローカル開発用のマスタ・ダミーデータ投入スクリプト。
 * 旧スタック（Next.js + Prisma、`legacy/prisma/seed.ts`）にあった初期データ投入ロジックを
 * 現行の Drizzle スキーマに移植したもの。実行のたびに対象テーブルをクリアしてから再投入する。
 * 認証まわり（users / invitation_tokens）は対象外（`pnpm run db:seed:auth` で別途管理）。
 *
 * 「今シーズン」を起点に前・今・次の3シーズン分の勤務実績（シフト・アサイン・勤務可否申告）を
 * 通年で生成する。過去月は配置済み、今月は編集途中、未来月は未配置とする。
 * 勤務可用性を先に投入し、勤務不可には配置しない。統計の偏りも確認できるよう、
 * 割当は全員均等ではなく「活動度ランク」による重み付きランダムでまばらに行う。
 */
import { fakerJA as faker } from '@faker-js/faker';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
  instructorAvailabilities,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
} from '../src/server/db/schema.ts';
import {
  buildDemoAvailabilities,
  buildDemoFrames,
  buildDemoSeasons,
  demoToday,
  type DemoAvailability,
  type DemoFrame,
} from './lib/demo-schedule.ts';
import { getLocalD1Path } from './lib/get-local-d1-path.ts';

const INSTRUCTOR_COUNT = 100;
const ACTIVE_RATIO = 0.9; // 90%がアクティブ、残り10%が休職(INACTIVE)
const DEPARTMENT_CODES = { ski: 'ski', snowboard: 'snowboard' } as const;
// 資格の shortName に対応する対象資格設定。
// 外側の配列が資格ランク、内側の配列が同一ランクに属する資格を表す。
const GENERAL_LESSON_CERTIFICATION_TIERS: readonly (readonly string[])[] = [
  ['指導員'],
  ['準指導員'],
  ['認定指導員'],
];
const PREFECTURE_EVENT_CERTIFICATION_TIERS: readonly (readonly string[])[] = [
  ['指導員', '準指導員'],
];
const BADGE_TEST_CERTIFICATION_TIERS: readonly (readonly string[])[] = [
  ['A級検定員', 'B級検定員', 'C級検定員'],
];

/** 配列を指定サイズごとのチャンクに分割する（SQLite のバインド変数上限対策） */
function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type Db = ReturnType<typeof drizzle>;

/** シフト種類と部門別の利用設定を投入する */
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

  const shiftTypeRows = [general, group, badgeTest, prefectureEvent];
  const departmentShiftTypeRows = await db
    .insert(departmentShiftTypes)
    .values(
      Object.values(DEPARTMENT_CODES).flatMap((departmentCode) =>
        shiftTypeRows.map((shiftType, index) => ({
          departmentCode,
          shiftTypeId: shiftType.id,
          sortOrder: index + 1,
        })),
      ),
    )
    .returning();

  console.log(
    `シフト種類: ${general.name}, ${group.name}, ${badgeTest.name}, ${prefectureEvent.name}`,
  );
  const skiSettingCount = departmentShiftTypeRows.filter(
    (row) => row.departmentCode === DEPARTMENT_CODES.ski,
  ).length;
  const snowboardSettingCount = departmentShiftTypeRows.filter(
    (row) => row.departmentCode === DEPARTMENT_CODES.snowboard,
  ).length;
  console.log(
    `部門別シフト種別設定: スキー${skiSettingCount}件、スノーボード${snowboardSettingCount}件`,
  );
  return { general, group, badgeTest, prefectureEvent, departmentShiftTypeRows };
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

/** 部門別シフト種別ごとの対象資格を、資格レベル順に投入する */
async function seedCertificationRequirements(
  db: Db,
  shiftTypeRows: Awaited<ReturnType<typeof seedShiftTypes>>,
  certs: { skiCertifications: CertRow[]; snowboardCertifications: CertRow[] },
) {
  const certificationRowsByDepartment: Record<string, CertRow[]> = {
    [DEPARTMENT_CODES.ski]: certs.skiCertifications,
    [DEPARTMENT_CODES.snowboard]: certs.snowboardCertifications,
  };
  const certificationShortNamesByTierByShiftTypeId = new Map<
    string,
    readonly (readonly string[])[]
  >([
    [shiftTypeRows.general.id, GENERAL_LESSON_CERTIFICATION_TIERS],
    [shiftTypeRows.group.id, []],
    [shiftTypeRows.badgeTest.id, BADGE_TEST_CERTIFICATION_TIERS],
    [shiftTypeRows.prefectureEvent.id, PREFECTURE_EVENT_CERTIFICATION_TIERS],
  ]);
  const rows = shiftTypeRows.departmentShiftTypeRows.flatMap((frame) => {
    const certificationRows = certificationRowsByDepartment[frame.departmentCode];
    const certificationShortNamesByTier = certificationShortNamesByTierByShiftTypeId.get(
      frame.shiftTypeId,
    );
    if (!certificationRows || !certificationShortNamesByTier) {
      throw new Error('シフト種別設定に対応する対象資格が見つかりません');
    }

    return certificationShortNamesByTier.flatMap((certificationShortNames, tierIndex) =>
      certificationShortNames.map((shortName) => {
        const matchedCertifications = certificationRows.filter(
          (row) => row.shortName === shortName,
        );
        if (matchedCertifications.length !== 1) {
          throw new Error(`対象資格「${shortName}」を一意に特定できません`);
        }
        const [certification] = matchedCertifications;
        if (!certification) {
          throw new Error(`対象資格「${shortName}」を取得できません`);
        }
        return {
          departmentShiftTypeId: frame.id,
          certificationId: certification.id,
          tierRank: tierIndex + 1,
        };
      }),
    );
  });

  await db.insert(certificationRequirements).values(rows);
  console.log(`対象資格設定: ${rows.length}件作成`);
  return certificationShortNamesByTierByShiftTypeId;
}

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

type CertRow = { id: string; shortName: string };

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

/** 必要人数と配置数の生成計画を持つ勤務枠。未配置枠も下書きShiftとして保持する。 */
type ShiftSeed = DemoFrame & { id: string };

/** 通年3シーズンの必要人数と、配置対象のシフトを作成する。 */
async function seedShifts(
  db: Db,
  shiftTypeIds: Parameters<typeof buildDemoFrames>[2],
  today: Date,
) {
  const seasons = buildDemoSeasons(today);
  const groups: { label: string; shifts: ShiftSeed[] }[] = [];
  for (const season of seasons) {
    const frames = buildDemoFrames(season, today, shiftTypeIds);
    const created: ShiftSeed[] = [];
    for (const batch of chunk(frames, 50)) {
      // returningの順序に依存せず日付・部門・種別で生成計画と対応させる。
      const inserted = await db
        .insert(shifts)
        .values(
          batch.map((frame) => ({
            date: frame.date,
            departmentCode: frame.departmentCode,
            shiftTypeId: frame.shiftTypeId,
            description: frame.description,
            requiredCount: frame.requiredCount,
            status: frame.assignmentCount > 0 ? 'PUBLISHED' : 'DRAFT',
          })),
        )
        .returning();
      for (const frame of batch) {
        const row = inserted.find(
          (row) =>
            row.date.getTime() === frame.date.getTime() &&
            row.departmentCode === frame.departmentCode &&
            row.shiftTypeId === frame.shiftTypeId,
        );
        if (!row) throw new Error('生成計画に対応するシフトが見つかりません');
        created.push({ ...frame, id: row.id });
      }
    }
    groups.push({ label: season.label, shifts: created });
    console.log(`  [${season.label}] 必要人数: ${frames.length}枠、配置対象: ${created.length}枠`);
  }
  return { seasons, groups };
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
  return ACTIVITY_RANKS[3];
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

/** 勤務可用性・資格・同日重複を考慮し、生成計画の人数まで重み付き抽選で配置する。 */
async function seedShiftAssignments(
  db: Db,
  seasonGroups: { label: string; shifts: ShiftSeed[] }[],
  instructorRows: Awaited<ReturnType<typeof seedInstructors>>,
  instructorCertRows: { instructorId: string; certificationId: string }[],
  certs: { skiCertifications: CertRow[]; snowboardCertifications: CertRow[] },
  certificationTiersByShiftTypeId: Map<string, readonly (readonly string[])[]>,
  availabilityRows: DemoAvailability[],
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

  const unavailableByDate = new Map<string, Set<string>>();
  for (const row of availabilityRows) {
    if (row.type !== 'UNAVAILABLE') continue;
    const key = row.date.toISOString().slice(0, 10);
    const ids = unavailableByDate.get(key) ?? new Set<string>();
    ids.add(row.instructorId);
    unavailableByDate.set(key, ids);
  }
  const certificationIdsByInstructor = new Map<string, Set<string>>();
  for (const row of instructorCertRows) {
    const ids = certificationIdsByInstructor.get(row.instructorId) ?? new Set<string>();
    ids.add(row.certificationId);
    certificationIdsByInstructor.set(row.instructorId, ids);
  }
  let totalAssignments = 0;

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

    for (const [dateString, dateShifts] of shiftsByDate) {
      const assignedToday = new Set(unavailableByDate.get(dateString));

      for (const shift of dateShifts) {
        const departmentPool =
          shift.departmentCode === DEPARTMENT_CODES.ski ? skiPool : snowboardPool;
        const departmentCerts =
          shift.departmentCode === DEPARTMENT_CODES.ski
            ? certs.skiCertifications
            : certs.snowboardCertifications;
        const tiers = certificationTiersByShiftTypeId.get(shift.shiftTypeId);
        if (!tiers) throw new Error('シフト種別の対象資格設定が見つかりません');
        const qualifiedIds = new Set(
          departmentCerts
            .filter((cert) => tiers.flat().includes(cert.shortName))
            .map((cert) => cert.id),
        );
        const pool = departmentPool.filter(
          (instructor) =>
            tiers.length === 0 ||
            [...(certificationIdsByInstructor.get(instructor.id) ?? [])].some((id) =>
              qualifiedIds.has(id),
            ),
        );
        if (pool.length === 0) continue;

        const assigned = pickWeightedWithoutReplacement(pool, shift.assignmentCount, assignedToday);
        for (const instructorId of assigned) {
          assignedToday.add(instructorId);
          assignments.push({ shiftId: shift.id, instructorId });
        }
      }
    }

    for (const batch of chunk(assignments, 100)) {
      await db.insert(shiftAssignments).values(batch);
    }

    totalAssignments += assignments.length;
    console.log(`  [${season.label}] シフトアサイン: ${assignments.length}件`);
  }

  console.log(`シフトアサイン合計: ${totalAssignments}件作成`);
  console.log(`   - スキー担当: ${skiInstructors.length}名`);
  console.log(`   - スノーボード担当: ${snowboardInstructors.length}名`);
}

/** 割当より先に3状態の申告を投入し、未回答は行なしで保持する。 */
async function seedInstructorAvailabilities(db: Db, rows: DemoAvailability[]) {
  for (const batch of chunk(rows, 100)) {
    await db.insert(instructorAvailabilities).values(batch);
  }
  console.log(
    `勤務可用性: ${rows.length}件作成（勤務可・要調整・勤務不可、月後半／全月未回答を含む）`,
  );
}

/** 業務データ（シフト種類・資格・インストラクター・シフト・アサイン・勤務可否申告）を全クリアする */
async function clearExistingData(db: Db) {
  console.log('既存データをクリア中...');
  await db.delete(instructorAvailabilities);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(certificationRequirements);
  await db.delete(instructorCertifications);
  await db.delete(instructors);
  await db.delete(certifications);
  await db.delete(departmentShiftTypes);
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
    const certificationTiersByShiftTypeId = await seedCertificationRequirements(
      db,
      shiftTypeRows,
      certs,
    );
    const instructorRows = await seedInstructors(db);
    const instructorCertRows = await seedInstructorCertifications(db, instructorRows, certs);

    const today = demoToday();
    const { seasons, groups } = await seedShifts(db, shiftTypeIds, today);
    const availabilityRows = buildDemoAvailabilities(
      instructorRows
        .filter((instructor) => instructor.status === 'ACTIVE')
        .map((instructor) => instructor.id),
      seasons,
    );
    await seedInstructorAvailabilities(db, availabilityRows);
    await seedShiftAssignments(
      db,
      groups,
      instructorRows,
      instructorCertRows,
      certs,
      certificationTiersByShiftTypeId,
      availabilityRows,
    );
    console.log(
      `開発対象月: ${today.toISOString().slice(0, 7)}（日付の3日周期で配置済み・一部配置・未配置）`,
    );
    console.log('過去月は配置済み、未来月は必要人数と申告のみです。');

    console.log('\n初期データ投入完了！');
  } finally {
    client.close();
  }
}

main().catch((e: unknown) => {
  console.error('シードデータ投入エラー:', e);
  process.exit(1);
});
