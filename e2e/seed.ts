/**
 * E2E 用の決定的なシード。乱数・現在日時に依存せず、全行に固定 ID を使うため何度実行しても同じ結果になる。
 * 書き込み先は E2E 専用のローカル D1（`.wrangler/e2e-state`）に限定する。
 * tsx で実行するため、src の schema.ts を import して Drizzle で型安全に投入する。
 */
import { isAbsolute, relative, resolve } from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { getLocalD1Path } from '../scripts/lib/get-local-d1-path.ts';
import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema.ts';
import { E2E_PERSIST_DIR } from './env.ts';
import { E2E_LINKED_INSTRUCTOR_IDS, E2E_USERS } from './fixtures/users.ts';

/** 固定 ID の組み立て（UUID 形式） */
const fixedId = (kind: string, n: number) =>
  `00000000-0000-4000-8000-${kind}${String(n).padStart(8, '0')}`;

/** shifts.date は UTC 午前0時で保存する（API の parseShiftDate と同じ。秒への変換は Drizzle が行う） */
const toDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

const CERTIFICATION_ID = fixedId('c001', 1);
const SHIFT_TYPE_ID = fixedId('d001', 1);
const DEPARTMENT_SHIFT_TYPE_ID = fixedId('e001', 1);
const REQUIREMENT_ID = fixedId('f001', 1);

const ADMIN_I = E2E_LINKED_INSTRUCTOR_IDS.admin;
const MANAGER_I = E2E_LINKED_INSTRUCTOR_IDS.manager;
const MEMBER_I = E2E_LINKED_INSTRUCTOR_IDS.member;
const CANDIDATE_I = '00000000-0000-4000-8000-00000000b004';

/** ユーザー紐付け分（E2E_LINKED_INSTRUCTOR_IDS）＋割当候補のインストラクター */
const INSTRUCTORS: readonly { id: string; lastName: string; firstName: string }[] = [
  { id: ADMIN_I, lastName: '山田', firstName: '太郎' },
  { id: MANAGER_I, lastName: '佐藤', firstName: '花子' },
  { id: MEMBER_I, lastName: '鈴木', firstName: '次郎' },
  { id: CANDIDATE_I, lastName: '高橋', firstName: '一郎' },
  { id: '00000000-0000-4000-8000-00000000b005', lastName: '伊藤', firstName: '二郎' },
  { id: '00000000-0000-4000-8000-00000000b006', lastName: '渡辺', firstName: '三郎' },
];

type SeedShift = {
  id: string;
  date: string;
  status: 'DRAFT' | 'PUBLISHED';
  requiredCount: number;
  assignedInstructorIds: readonly string[];
};

/**
 * 一般レッスン（スキー）のシフト。固定日（2026-01-15 木）以降のみ。
 * 1/16 は MEMBER 割当済みの公開シフト、1/18 は割当スモーク用の空きのある下書き。
 */
const SHIFTS: readonly SeedShift[] = [
  {
    id: fixedId('a101', 1),
    date: '2026-01-15',
    status: 'PUBLISHED',
    requiredCount: 2,
    assignedInstructorIds: [MANAGER_I],
  },
  {
    id: fixedId('a101', 2),
    date: '2026-01-16',
    status: 'PUBLISHED',
    requiredCount: 2,
    assignedInstructorIds: [MEMBER_I, CANDIDATE_I],
  },
  {
    id: fixedId('a101', 3),
    date: '2026-01-17',
    status: 'PUBLISHED',
    requiredCount: 2,
    assignedInstructorIds: [ADMIN_I],
  },
  {
    id: fixedId('a101', 4),
    date: '2026-01-18',
    status: 'DRAFT',
    requiredCount: 2,
    assignedInstructorIds: [],
  },
];

type Db = ReturnType<typeof drizzle>;

/**
 * 投入クエリを組み立てる。全行が固定 ID のため `onConflictDoNothing` で再実行しても行が増えない。
 * 外部キーの参照先が先に入るよう、マスタ → 紐付け → シフト → 割当の順に並べる。
 */
function buildQueries(db: Db) {
  const shiftAssignmentRows = SHIFTS.flatMap((shift, shiftIndex) =>
    shift.assignedInstructorIds.map((instructorId, index) => ({
      id: fixedId('a201', shiftIndex * 10 + index + 1),
      shiftId: shift.id,
      instructorId,
      assignedAt: toDate(shift.date),
    })),
  );

  return [
    db
      .insert(instructors)
      .values(INSTRUCTORS.map((instructor) => ({ ...instructor, status: 'ACTIVE' })))
      .onConflictDoNothing(),
    db
      .insert(users)
      .values(
        E2E_USERS.map((user) => ({
          id: user.id,
          lineUserId: user.lineUserId,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          instructorId: user.instructorId,
        })),
      )
      .onConflictDoNothing(),
    // 割当候補に出るには部門の資格が必要なため、スキー部門の資格を全員に付与する
    db
      .insert(certifications)
      .values({
        id: CERTIFICATION_ID,
        departmentCode: 'ski',
        name: '公認スキー指導員',
        shortName: '指導員',
        organization: 'SAJ',
      })
      .onConflictDoNothing(),
    db
      .insert(instructorCertifications)
      .values(
        INSTRUCTORS.map((instructor, index) => ({
          id: fixedId('c101', index + 1),
          instructorId: instructor.id,
          certificationId: CERTIFICATION_ID,
        })),
      )
      .onConflictDoNothing(),
    db.insert(shiftTypes).values({ id: SHIFT_TYPE_ID, name: '一般レッスン' }).onConflictDoNothing(),
    db
      .insert(departmentShiftTypes)
      .values({
        id: DEPARTMENT_SHIFT_TYPE_ID,
        departmentCode: 'ski',
        shiftTypeId: SHIFT_TYPE_ID,
        sortOrder: 1,
      })
      .onConflictDoNothing(),
    db
      .insert(certificationRequirements)
      .values({
        id: REQUIREMENT_ID,
        departmentShiftTypeId: DEPARTMENT_SHIFT_TYPE_ID,
        certificationId: CERTIFICATION_ID,
        tierRank: 1,
      })
      .onConflictDoNothing(),
    db
      .insert(shifts)
      .values(
        SHIFTS.map((shift) => ({
          id: shift.id,
          date: toDate(shift.date),
          departmentCode: 'ski',
          shiftTypeId: SHIFT_TYPE_ID,
          requiredCount: shift.requiredCount,
          status: shift.status,
        })),
      )
      .onConflictDoNothing(),
    db.insert(shiftAssignments).values(shiftAssignmentRows).onConflictDoNothing(),
  ] as const;
}

/**
 * E2E 用 D1 に最小業務データを投入する。
 * 書き込み先が `.wrangler/e2e-state` 配下でなければ（開発用 D1 の破壊を防ぐため）例外で止める。
 */
export async function seedE2e(): Promise<void> {
  const sqlitePath = getLocalD1Path(E2E_PERSIST_DIR);
  const fromE2eDir = relative(resolve(E2E_PERSIST_DIR), resolve(sqlitePath));
  if (fromE2eDir.startsWith('..') || isAbsolute(fromE2eDir)) {
    throw new Error(`E2E seed の書き込み先が E2E 用ディレクトリ外です: ${sqlitePath}`);
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  try {
    const db = drizzle(client);
    // batch は1トランザクションで実行されるため、途中で失敗しても中途半端な状態を残さない
    await db.batch(buildQueries(db));
  } finally {
    client.close();
  }
}

if (import.meta.main) {
  await seedE2e();
  console.log('E2E seed 完了');
}
