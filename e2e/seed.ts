/**
 * E2E 用の決定的なシード。乱数・現在日時に依存せず、全行に固定 ID を使うため何度実行しても同じ結果になる。
 * 書き込み先は E2E 専用のローカル D1（`.wrangler/e2e-state`）に限定する。
 * （src の schema.ts は node 直接実行で import できないため、素の SQL で投入する）
 */
import { isAbsolute, relative, resolve } from 'node:path';

import { createClient, type InStatement } from '@libsql/client';

import { getLocalD1Path } from '../scripts/lib/get-local-d1-path.ts';
import { E2E_PERSIST_DIR } from './env.ts';
import { E2E_LINKED_INSTRUCTOR_IDS, E2E_USERS } from './fixtures/users.ts';

/** 固定 ID の組み立て（UUID 形式） */
const fixedId = (kind: string, n: number) =>
  `00000000-0000-4000-8000-${kind}${String(n).padStart(8, '0')}`;

/** shifts.date は UTC 午前0時の epoch 秒で保存する（API の parseShiftDate と同じ） */
const toDateSeconds = (date: string) => Date.parse(`${date}T00:00:00.000Z`) / 1000;

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

/** 投入する SQL 文を組み立てる。`INSERT OR IGNORE` で再実行しても行が増えない */
function buildStatements(): InStatement[] {
  const statements: InStatement[] = [];

  for (const instructor of INSTRUCTORS) {
    statements.push({
      sql: "INSERT OR IGNORE INTO instructors (id, last_name, first_name, status) VALUES (?, ?, ?, 'ACTIVE')",
      args: [instructor.id, instructor.lastName, instructor.firstName],
    });
  }

  for (const user of E2E_USERS) {
    statements.push({
      sql: 'INSERT OR IGNORE INTO users (id, line_user_id, display_name, role, is_active, instructor_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [
        user.id,
        user.lineUserId,
        user.displayName,
        user.role,
        user.isActive ? 1 : 0,
        user.instructorId,
      ],
    });
  }

  // 割当候補に出るには部門の資格が必要なため、スキー部門の資格を全員に付与する
  statements.push({
    sql: "INSERT OR IGNORE INTO certifications (id, department_code, name, short_name, organization) VALUES (?, 'ski', '公認スキー指導員', '指導員', 'SAJ')",
    args: [CERTIFICATION_ID],
  });
  INSTRUCTORS.forEach((instructor, index) => {
    statements.push({
      sql: 'INSERT OR IGNORE INTO instructor_certifications (id, instructor_id, certification_id) VALUES (?, ?, ?)',
      args: [fixedId('c101', index + 1), instructor.id, CERTIFICATION_ID],
    });
  });

  statements.push(
    {
      sql: "INSERT OR IGNORE INTO shift_types (id, name) VALUES (?, '一般レッスン')",
      args: [SHIFT_TYPE_ID],
    },
    {
      sql: "INSERT OR IGNORE INTO department_shift_types (id, department_code, shift_type_id, sort_order) VALUES (?, 'ski', ?, 1)",
      args: [DEPARTMENT_SHIFT_TYPE_ID, SHIFT_TYPE_ID],
    },
    {
      sql: 'INSERT OR IGNORE INTO certification_requirements (id, department_shift_type_id, certification_id, tier_rank) VALUES (?, ?, ?, 1)',
      args: [REQUIREMENT_ID, DEPARTMENT_SHIFT_TYPE_ID, CERTIFICATION_ID],
    },
  );

  SHIFTS.forEach((shift, shiftIndex) => {
    statements.push({
      sql: "INSERT OR IGNORE INTO shifts (id, date, department_code, shift_type_id, required_count, status) VALUES (?, ?, 'ski', ?, ?, ?)",
      args: [shift.id, toDateSeconds(shift.date), SHIFT_TYPE_ID, shift.requiredCount, shift.status],
    });
    shift.assignedInstructorIds.forEach((instructorId, index) => {
      statements.push({
        sql: 'INSERT OR IGNORE INTO shift_assignments (id, shift_id, instructor_id, assigned_at) VALUES (?, ?, ?, ?)',
        args: [
          fixedId('a201', shiftIndex * 10 + index + 1),
          shift.id,
          instructorId,
          toDateSeconds(shift.date),
        ],
      });
    });
  });

  return statements;
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
    await client.batch(buildStatements(), 'write');
  } finally {
    client.close();
  }
}

if (import.meta.main) {
  await seedE2e();
  console.log('E2E seed 完了');
}
