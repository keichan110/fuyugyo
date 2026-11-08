import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { Database } from '@/server/db/client';
import { shifts } from '@/server/db/schema';

type SavedShift = typeof shifts.$inferSelect;

type ShiftKey = {
  date: Date;
  departmentCode: string;
  shiftTypeId: string;
};

/**
 * 同じバッチの後続書き込みに先立ち、確認済みの枠と更新世代をDB上で検証する。
 * 競合時は非負制約違反でバッチ全体をロールバックする。存在しない枠の競合も検出する。
 */
export function guardShiftWrite(db: Database, key: ShiftKey, saved: SavedShift | undefined) {
  const id = saved?.id ?? crypto.randomUUID();
  return {
    id,
    operation: db
      .insert(shifts)
      .values({
        ...key,
        id,
        revision: saved
          ? sql`CASE WHEN EXISTS (SELECT 1 FROM shifts WHERE id = ${saved.id}) THEN 0 ELSE -1 END`
          : 0,
      })
      .onConflictDoUpdate({
        target: [shifts.date, shifts.departmentCode, shifts.shiftTypeId],
        set: {
          revision: sql`CASE WHEN ${shifts.id} = ${saved?.id ?? ''} AND ${shifts.revision} = ${saved?.revision ?? -1} AND ${shifts.status} = ${saved?.status ?? 'DRAFT'} THEN ${shifts.revision} + 1 ELSE -1 END`,
          updatedAt: new Date(),
        },
      }),
  };
}

/** 画面が編集を始めた時点から枠が変わっていれば、上書きせず再確認を促す。 */
export function checkShiftRevision(
  saved: SavedShift | undefined,
  expected: number | null | undefined,
  expectedShiftId?: string | null,
) {
  if (
    (expected !== undefined && expected !== (saved?.revision ?? null)) ||
    (expectedShiftId !== undefined && expectedShiftId !== (saved?.id ?? null))
  ) {
    throw new HTTPException(409, {
      message: 'シフトが更新されています。最新の内容を確認してください',
    });
  }
}

/** D1のネストしたエラーから業務制約を識別し、HTTP境界で扱える競合へ変換する。 */
export function rethrowShiftWriteError(error: unknown): never {
  let current = error;
  const messages: string[] = [];
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  const message = messages.join(' ');
  if (message.includes('shift_publish_unavailable')) {
    throw new HTTPException(409, {
      message: '勤務不可の担当者が含まれています。勤務可否を確認してください',
    });
  }
  if (message.includes('availability_published_assignment')) {
    throw new HTTPException(409, {
      message: '公開済みシフトに割り当てられた日の勤務可否は変更できません',
    });
  }
  if (message.includes('revision') || message.includes('UNIQUE constraint failed: shifts.')) {
    throw new HTTPException(409, {
      message: 'シフトが更新されています。最新の内容を確認してください',
    });
  }
  throw error;
}
