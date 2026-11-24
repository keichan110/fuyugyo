import { createClient } from '@libsql/client';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import { getLocalD1Path } from '../../scripts/lib/get-local-d1-path.ts';
import {
  instructorAvailabilities,
  shiftAssignments,
  shifts,
  users,
} from '../../src/server/db/schema.ts';
import { E2E_PERSIST_DIR } from '../env.ts';
import { BUSINESS_DATE } from './business-date.ts';

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
