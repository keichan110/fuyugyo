import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from './client';
import {
  departmentShiftTypeCertifications,
  instructorCertifications,
  instructors,
} from './schema';

/**
 * 指定枠に紐づく資格を持つインストラクターの ID を取得する。
 *
 * @param db - D1 に接続した Drizzle クライアント
 * @param departmentShiftTypeId - 部門別シフト種別の ID
 * @param options - `activeOnly` が true の場合は ACTIVE のみを返す
 * @returns 枠の対象資格を一つ以上保有するインストラクターの ID 一覧
 */
export async function selectInstructorIdsWithFrameCertification(
  db: Database,
  departmentShiftTypeId: string,
  options: { activeOnly?: boolean } = {},
): Promise<string[]> {
  const certificationRows = await db
    .select({ certificationId: departmentShiftTypeCertifications.certificationId })
    .from(departmentShiftTypeCertifications)
    .where(eq(departmentShiftTypeCertifications.departmentShiftTypeId, departmentShiftTypeId));
  const certificationIds = certificationRows.map((row) => row.certificationId);

  if (certificationIds.length === 0) {
    return [];
  }

  const conditions = [inArray(instructorCertifications.certificationId, certificationIds)];
  if (options.activeOnly ?? true) {
    conditions.push(eq(instructors.status, 'ACTIVE'));
  }

  const rows = await db
    .selectDistinct({ instructorId: instructors.id })
    .from(instructors)
    .innerJoin(instructorCertifications, eq(instructors.id, instructorCertifications.instructorId))
    .where(and(...conditions));

  return rows.map((row) => row.instructorId);
}
