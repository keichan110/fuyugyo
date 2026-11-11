import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';
import { SEASON_START_MONTH } from '@/features/shifts/season';
import { seasonRangeForDate } from '@/features/shifts/workload';
import { createDb } from '@/server/db/client';
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
} from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { seasonAnalysisQuerySchema, type SeasonAnalysis } from './schema';

/** YYYY-MM-DD を UTC 0時の Date に変換する（shifts/api.ts の `parseShiftDate` と同じ正規化） */
function parseShiftDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Date を YYYY-MM-DD へ整形する（UTC 基準） */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 部門コードとして解釈できる値だけを返す。DB に未知の値があっても集計を壊さない */
function toDepartmentCode(value: string): DepartmentCode | null {
  const parsed = departmentCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * シーズン分析の Hono ルート。
 * 集計前の事実データ（インストラクター・配置・枠・勤務可否の例外）を数クエリで返し、
 * 集計は `aggregators.ts` がクライアント側で行う。MANAGER 以上のみ閲覧できる。
 */
export const seasonAnalysisRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>().get('/', requireAuth, requireRole('MANAGER'), async (c) => {
  const parsed = seasonAnalysisQuerySchema.safeParse({ season: c.req.query('season') });
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'season（シーズン開始年）は必須です' });
  }
  const seasonRange = seasonRangeForDate(
    `${parsed.data.season}-${String(SEASON_START_MONTH).padStart(2, '0')}-01`,
  );
  const from = parseShiftDate(seasonRange.from);
  const to = parseShiftDate(seasonRange.to);
  const db = createDb(c.env.DB);

  const [
    instructorRows,
    certificationRows,
    assignmentRows,
    shiftRows,
    availabilityRows,
    tierRows,
    tierDefinitionRows,
  ] = await Promise.all([
    db
      .select({
        id: instructors.id,
        lastName: instructors.lastName,
        firstName: instructors.firstName,
        status: instructors.status,
      })
      .from(instructors)
      .orderBy(asc(instructors.lastName), asc(instructors.firstName), asc(instructors.id)),
    db
      .select({
        instructorId: instructorCertifications.instructorId,
        departmentCode: certifications.departmentCode,
      })
      .from(instructorCertifications)
      .innerJoin(certifications, eq(certifications.id, instructorCertifications.certificationId))
      .where(eq(certifications.isActive, true)),
    db
      .select({
        shiftId: shiftAssignments.shiftId,
        instructorId: shiftAssignments.instructorId,
        date: shifts.date,
        departmentCode: shifts.departmentCode,
        shiftTypeId: shifts.shiftTypeId,
        shiftStatus: shifts.status,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
      .where(and(gte(shifts.date, from), lte(shifts.date, to))),
    db
      .select({
        id: shifts.id,
        date: shifts.date,
        departmentCode: shifts.departmentCode,
        shiftTypeId: shifts.shiftTypeId,
        shiftTypeName: shiftTypes.name,
        requiredCount: shifts.requiredCount,
        status: shifts.status,
      })
      .from(shifts)
      .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId))
      .where(and(gte(shifts.date, from), lte(shifts.date, to)))
      .orderBy(asc(shifts.date)),
    db
      .select({
        instructorId: instructorAvailabilities.instructorId,
        date: instructorAvailabilities.date,
        type: instructorAvailabilities.type,
      })
      .from(instructorAvailabilities)
      .where(
        and(
          gte(instructorAvailabilities.date, from),
          lte(instructorAvailabilities.date, to),
          ne(instructorAvailabilities.type, 'AVAILABLE'),
        ),
      ),
    // 配置ごとの資格ランク。枠の必要資格のうち本人が持つものを全行返し、最上位は後段で選ぶ
    db
      .select({
        shiftId: shiftAssignments.shiftId,
        instructorId: shiftAssignments.instructorId,
        tierRank: certificationRequirements.tierRank,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
      .innerJoin(
        departmentShiftTypes,
        and(
          eq(departmentShiftTypes.departmentCode, shifts.departmentCode),
          eq(departmentShiftTypes.shiftTypeId, shifts.shiftTypeId),
        ),
      )
      .innerJoin(
        certificationRequirements,
        eq(certificationRequirements.departmentShiftTypeId, departmentShiftTypes.id),
      )
      .innerJoin(
        instructorCertifications,
        and(
          eq(instructorCertifications.instructorId, shiftAssignments.instructorId),
          eq(instructorCertifications.certificationId, certificationRequirements.certificationId),
        ),
      )
      .where(and(gte(shifts.date, from), lte(shifts.date, to))),
    db
      .select({
        departmentCode: departmentShiftTypes.departmentCode,
        shiftTypeId: departmentShiftTypes.shiftTypeId,
        tierRank: certificationRequirements.tierRank,
        shortName: certifications.shortName,
      })
      .from(departmentShiftTypes)
      .innerJoin(
        certificationRequirements,
        eq(certificationRequirements.departmentShiftTypeId, departmentShiftTypes.id),
      )
      .innerJoin(certifications, eq(certifications.id, certificationRequirements.certificationId))
      .orderBy(asc(certificationRequirements.tierRank)),
  ]);

  // 枠ごとの配置人数は枠の取得結果とは別に配置行から数える（N+1 を避ける）
  const assignedCountByShift = new Map<string, number>();
  const shiftKey = (date: Date, departmentCode: string, shiftTypeId: string) =>
    `${formatDate(date)}:${departmentCode}:${shiftTypeId}`;
  for (const row of assignmentRows) {
    const key = shiftKey(row.date, row.departmentCode, row.shiftTypeId);
    assignedCountByShift.set(key, (assignedCountByShift.get(key) ?? 0) + 1);
  }

  // 同じ配置に複数の要件資格が該当しうるため、最小（最上位）のランクを採用する
  const bestTierByAssignment = new Map<string, number>();
  for (const row of tierRows) {
    const key = `${row.shiftId}:${row.instructorId}`;
    const current = bestTierByAssignment.get(key);
    if (current === undefined || row.tierRank < current) {
      bestTierByAssignment.set(key, row.tierRank);
    }
  }

  const qualifiedByInstructor = new Map<string, Set<DepartmentCode>>();
  for (const row of certificationRows) {
    const department = toDepartmentCode(row.departmentCode);
    if (department === null) continue;
    const set = qualifiedByInstructor.get(row.instructorId) ?? new Set<DepartmentCode>();
    set.add(department);
    qualifiedByInstructor.set(row.instructorId, set);
  }

  const response: SeasonAnalysis = {
    seasonRange,
    today: formatDate(new Date()),
    instructors: instructorRows.map((row) => ({
      id: row.id,
      displayName: `${row.lastName} ${row.firstName}`,
      status: row.status,
      qualifiedDepartments: [...(qualifiedByInstructor.get(row.id) ?? [])],
    })),
    assignments: assignmentRows.flatMap((row) => {
      const departmentCode = toDepartmentCode(row.departmentCode);
      return departmentCode === null
        ? []
        : [
            {
              instructorId: row.instructorId,
              date: formatDate(row.date),
              departmentCode,
              shiftTypeId: row.shiftTypeId,
              shiftStatus: row.shiftStatus,
              tierRank: bestTierByAssignment.get(`${row.shiftId}:${row.instructorId}`) ?? null,
            },
          ];
    }),
    shifts: shiftRows.flatMap((row) => {
      const departmentCode = toDepartmentCode(row.departmentCode);
      return departmentCode === null
        ? []
        : [
            {
              date: formatDate(row.date),
              departmentCode,
              shiftTypeId: row.shiftTypeId,
              shiftTypeName: row.shiftTypeName,
              requiredCount: row.requiredCount,
              status: row.status,
              assignedCount:
                assignedCountByShift.get(shiftKey(row.date, row.departmentCode, row.shiftTypeId)) ??
                0,
            },
          ];
    }),
    tierDefinitions: tierDefinitionRows.flatMap((row) => {
      const departmentCode = toDepartmentCode(row.departmentCode);
      return departmentCode === null
        ? []
        : [
            {
              departmentCode,
              shiftTypeId: row.shiftTypeId,
              tierRank: row.tierRank,
              certificationShortName: row.shortName,
            },
          ];
    }),
    availabilityExceptions: availabilityRows.flatMap((row) =>
      row.type === 'AVAILABLE'
        ? []
        : [{ instructorId: row.instructorId, date: formatDate(row.date), type: row.type }],
    ),
  };
  return c.json(response);
});
