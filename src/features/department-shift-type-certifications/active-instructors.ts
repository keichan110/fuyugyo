import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from '@/server/db/client';
import {
  departmentShiftTypeCertifications,
  instructorCertifications,
  instructors,
} from '@/server/db/schema';

/**
 * 指定枠に紐づく資格を持つ ACTIVE インストラクターの ID を取得する。
 *
 * @param db - D1 に接続した Drizzle クライアント
 * @param departmentShiftTypeId - 部門別シフト種別の ID
 * @returns 枠の対象資格を一つ以上保有する ACTIVE インストラクターの ID 一覧
 */
export async function selectActiveInstructorIdsWithFrameCertification(
  db: Database,
  departmentShiftTypeId: string,
): Promise<string[]> {
  const certificationRows = await db
    .select({ certificationId: departmentShiftTypeCertifications.certificationId })
    .from(departmentShiftTypeCertifications)
    .where(eq(departmentShiftTypeCertifications.departmentShiftTypeId, departmentShiftTypeId));
  const certificationIds = certificationRows.map((row) => row.certificationId);

  if (certificationIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinct({ instructorId: instructors.id })
    .from(instructors)
    .innerJoin(instructorCertifications, eq(instructors.id, instructorCertifications.instructorId))
    .where(
      and(
        eq(instructors.status, 'ACTIVE'),
        inArray(instructorCertifications.certificationId, certificationIds),
      ),
    );

  return rows.map((row) => row.instructorId);
}
