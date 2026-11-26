import { and, asc, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import { buildNotificationInserts } from '@/features/notifications/api';
import type { Database } from '@/server/db/client';
import { shiftAssignments, shifts, shiftTypes, users } from '@/server/db/schema';

/** 今回の操作で下書きから公開する保存済みの枠。 */
export type PublishingShift = {
  id: string;
  /** 公開を書き込んだ後の更新世代 */
  revision: number;
};

/**
 * 公開操作を識別するイベントキーを組み立てる。
 * 枠 ID 順に並べて要求順への依存をなくし、更新世代を含めて取り消し後の再公開を別の出来事にする。
 */
function buildEventKey(publishing: readonly PublishingShift[]): string {
  const slots = publishing
    .map(({ id, revision }): [string, number] => [id, revision])
    .sort(([left], [right]) => (left < right ? -1 : 1));
  return `shift-publication:v1:${JSON.stringify(slots)}`;
}

/**
 * シフト公開を担当者へ知らせる通知の INSERT を組み立てる（サーバー専用）。ここでは実行しないため、
 * 呼び出し元が公開の書き込みより後ろに並べ、同じ `db.batch` でまとめて確定させる。
 *
 * 宛先は対象枠の担当インストラクターに紐づく有効なユーザーで、1ユーザーにつき1件にまとめる。
 * 紐づけと有効状態はこの関数の取得時点で判定する。担当の変更は呼び出し元の更新世代の検証で検出する。
 *
 * @param db - Drizzle クライアント
 * @param departmentCode - 公開する枠の部門
 * @param publishing - 今回の操作で下書きから公開する保存済みの枠
 * @returns 宛先ユーザー1人につき1つの INSERT。公開する枠や宛先がなければ空配列
 */
export async function buildShiftPublicationNotificationInserts(
  db: Database,
  departmentCode: DepartmentCode,
  publishing: readonly PublishingShift[],
): Promise<BatchItem<'sqlite'>[]> {
  if (publishing.length === 0) return [];

  // 1回の公開は最大31枠のため、D1 のバインドパラメータ上限には達しない
  const rows = await db
    .select({ userId: users.id, date: shifts.date, shiftTypeName: shiftTypes.name })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
    .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId))
    .innerJoin(users, eq(users.instructorId, shiftAssignments.instructorId))
    .where(
      and(
        inArray(
          shifts.id,
          publishing.map((shift) => shift.id),
        ),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(shifts.date));

  // 日付の昇順で取得しているため、各ユーザーの先頭がリンク先の最初の対象日になる
  const targetsByUserId = new Map<string, { firstDate: string; lines: string[] }>();
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    const target = targetsByUserId.get(row.userId) ?? { firstDate: date, lines: [] };
    target.lines.push(`${date} / ${DEPARTMENT_LABELS[departmentCode]} / ${row.shiftTypeName}`);
    targetsByUserId.set(row.userId, target);
  }

  const eventKey = buildEventKey(publishing);
  return buildNotificationInserts(
    db,
    [...targetsByUserId].map(([userId, { firstDate, lines }]) => ({
      userId,
      title: 'シフトが公開されました',
      body: lines.join('\n'),
      actionUrl: `/shifts?date=${firstDate}`,
      eventKey,
    })),
  );
}
