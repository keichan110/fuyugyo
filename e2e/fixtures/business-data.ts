import { createClient } from '@libsql/client';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import { getLocalD1Path } from '../../scripts/lib/get-local-d1-path.ts';
import {
  instructorAvailabilities,
  notifications,
  shiftAssignments,
  shifts,
  users,
} from '../../src/server/db/schema.ts';
import { E2E_PERSIST_DIR } from '../env.ts';
import { BUSINESS_DATE } from './business-date.ts';
import { E2E_USERS, type E2eUser } from './users.ts';

/** 権限変更テスト専用ユーザー。ログイン主体の3ロールや無効ユーザーは変更しない。 */
export const ROLE_TARGET_ID = '00000000-0000-4000-8000-00000000a005';

/**
 * 各業務テスト開始時に対象日と編集専用ユーザーだけを初期化する。
 * ブラウザprojectやファイルの実行順に依存せず、同じテストを単独でも再実行できる。
 */
export async function resetBusinessData(): Promise<void> {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    const db = drizzle(client);
    const date = new Date(`${BUSINESS_DATE}T00:00:00Z`);
    // libSQL側でも外部キーを有効化し、Shift削除時に割当を残さない。
    await client.execute('PRAGMA foreign_keys = ON');
    await db.batch([
      db.delete(shifts).where(and(eq(shifts.date, date), eq(shifts.departmentCode, 'ski'))),
      db.delete(instructorAvailabilities).where(eq(instructorAvailabilities.date, date)),
      db
        .insert(users)
        .values({
          id: ROLE_TARGET_ID,
          lineUserId: 'e2e-role-target',
          displayName: 'E2E権限変更対象',
          role: 'MEMBER',
          isActive: true,
        })
        .onConflictDoUpdate({ target: users.id, set: { role: 'MEMBER', isActive: true } }),
    ]);
  } finally {
    await client.close();
  }
}

/**
 * 業務フローの対象日（スキー）の枠の公開状態と配置を、画面や API を介さず D1 から直接読む。
 * 画面操作の結果が実際に保存されていることの確認に使う。
 */
export async function readBusinessShifts(): Promise<
  Array<{ status: string; instructorId: string | null }>
> {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    return await drizzle(client)
      .select({ status: shifts.status, instructorId: shiftAssignments.instructorId })
      .from(shifts)
      .leftJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shifts.date, new Date(`${BUSINESS_DATE}T00:00:00Z`)),
          eq(shifts.departmentCode, 'ski'),
        ),
      );
  } finally {
    await client.close();
  }
}

/** 両ブラウザで割当保存のスモークを繰り返せるよう、対象の割当だけを解除する。 */
export async function resetSmokeAssignment(): Promise<void> {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    await drizzle(client)
      .delete(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.shiftId, '00000000-0000-4000-8000-a10100000004'),
          eq(shiftAssignments.instructorId, '00000000-0000-4000-8000-00000000b005'),
        ),
      );
  } finally {
    await client.close();
  }
}

/** 通知テストで MEMBER に用意するお知らせの件数。履歴の追加読み込みが起きる件数にする。 */
const MEMBER_NOTIFICATION_COUNT = 25;

/** 未読にするお知らせの番号（新しい順）。トップの上限を超える件数と、2ページ目の未読を含める。 */
const UNREAD_NOTIFICATION_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 22];

/** MEMBER には見えてはいけない、別ユーザー宛てのお知らせの件名。 */
export const OTHER_USER_NOTIFICATION_TITLE = 'E2E別ユーザー宛て';

/** MEMBER 宛てのお知らせの件名を返す。番号は新しい順に1から振る。 */
export function notificationTitle(number: number): string {
  return `E2E通知${String(number).padStart(2, '0')}`;
}

/** E2E ユーザー定義から users.id を引く。 */
function e2eUserId(key: E2eUser['key']): string {
  const user = E2E_USERS.find((candidate) => candidate.key === key);
  if (!user) throw new Error(`E2E ユーザーが未定義です: ${key}`);
  return user.id;
}

/** 固定 ID のお知らせの行を組み立てる。作成日時は全件異なり、番号が小さいほど新しい。 */
function buildNotificationRows(allRead: boolean) {
  const newest = Date.parse('2026-01-14T09:00:00+09:00');
  const rowId = (number: number) =>
    `00000000-0000-4000-8000-a367${String(number).padStart(8, '0')}`;
  const own = Array.from({ length: MEMBER_NOTIFICATION_COUNT }, (_, index) => {
    const number = index + 1;
    const createdAt = new Date(newest - index * 60 * 60 * 1_000);
    const unread = !allRead && UNREAD_NOTIFICATION_NUMBERS.includes(number);
    return {
      id: rowId(number),
      userId: e2eUserId('member'),
      title: notificationTitle(number),
      // 2件目は改行と区切りのない長い文字列を含め、狭い画面での折り返しを確かめる
      body: number === 2 ? `1行目の本文\n${'a'.repeat(120)}` : `${number}件目の本文`,
      actionUrl: number === 1 ? '/shifts' : null,
      eventKey: `e2e-notification-${number}`,
      createdAt,
      readAt: unread ? null : createdAt,
    };
  });
  const other = {
    id: rowId(MEMBER_NOTIFICATION_COUNT + 1),
    userId: e2eUserId('manager'),
    title: OTHER_USER_NOTIFICATION_TITLE,
    body: '別ユーザー宛ての本文',
    actionUrl: null,
    eventKey: 'e2e-notification-other',
    // 混入すれば一覧の先頭に現れるよう、本人宛てより新しくする
    createdAt: new Date(newest + 60 * 60 * 1_000),
    readAt: null,
  };
  return [...own, other];
}

/**
 * 通知テストの固定 ID のお知らせだけを投入し直す。
 * 既読化したテストの後でも、別のブラウザー project が同じ初期状態から実行できる。
 *
 * @param options - `allRead` を指定すると MEMBER 宛てをすべて既読にする
 */
export async function resetNotifications(options: { allRead?: boolean } = {}): Promise<void> {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    const db = drizzle(client);
    const rows = buildNotificationRows(options.allRead ?? false);
    await db.batch([
      db.delete(notifications).where(
        inArray(
          notifications.id,
          rows.map((row) => row.id),
        ),
      ),
      db.insert(notifications).values(rows),
    ]);
  } finally {
    await client.close();
  }
}

/** お知らせの操作で業務データが変わらないことの確認用に、シフト・割当・勤務可否を D1 から直接読む。 */
export async function readShiftRelatedRecords() {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    const db = drizzle(client);
    return await db.batch([
      db.select().from(shifts).orderBy(shifts.id),
      db.select().from(shiftAssignments).orderBy(shiftAssignments.id),
      db
        .select()
        .from(instructorAvailabilities)
        .orderBy(instructorAvailabilities.instructorId, instructorAvailabilities.date),
    ]);
  } finally {
    await client.close();
  }
}
