import { and, asc, count, desc, eq, exists, gte, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { DEPARTMENT_LABELS, departmentCodeSchema } from '@/features/departments/schema';
import { selectInstructorIdsWithFrameCertification } from '@/server/db/certification-requirements';
import { createDb } from '@/server/db/client';
import type { Database } from '@/server/db/client';
import { isUniqueViolation } from '@/server/db/errors';
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
  users,
} from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { groupShiftsByWorkingDay, summarizeShifts } from './aggregators';
import {
  dateStringSchema,
  monthStringSchema,
  shiftAgendaDirectionSchema,
  upsertMonthlyAssignmentsSchema,
  type ShiftViewItem,
} from './schema';
import { seasonRangeForDate } from './workload';

/**
 * YYYY-MM-DD 文字列を UTC 0時の Date に変換する。
 * Shift の一意キー（date × 部門 × 種別）が常に同一タイムスタンプで比較されるよう、
 * 作成・検索の両経路でこの関数を通して正規化する。
 */
function parseShiftDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * YYYY-MM-DD 文字列が実在する暦日か検証する。
 * `dateStringSchema` は形式のみを見るため、`2026-02-31` のような値が
 * `new Date()` の正規化で別月に丸められ、境界チェックをすり抜けるのを防ぐ。
 */
function isValidCalendarDate(dateStr: string): boolean {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Date を YYYY-MM-DD 文字列へ整形する（UTC 基準・assignment-editor 出力用） */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD に指定日数を加算した YYYY-MM-DD を返す（UTC 基準） */
function addDays(dateStr: string, days: number): string {
  const date = parseShiftDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/** 環境値の月（1〜12）を読み取り、不正値ならデフォルトを使う */
function parseSeasonMonth(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return fallback;
  }
  return parsed;
}

/** インストラクター表示名（姓 名） */
function formatName(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`;
}

/** インストラクター表示名カナ（両方揃っているときのみ） */
function formatNameKana(lastNameKana: string | null, firstNameKana: string | null): string | null {
  if (lastNameKana && firstNameKana) {
    return `${lastNameKana} ${firstNameKana}`;
  }
  return null;
}

/**
 * D1 のクエリあたりバインドパラメータ上限（100個）を超えないよう、
 * 配列を最大 `size` 件ずつのチャンクに分割する。
 * リクエスト由来の動的 ID リストを `inArray` に渡す前に使う。
 */
const MAX_IN_ARRAY_CHUNK_SIZE = 90;

// junction がない既存 Shift は可用性から外れていても表示する必要があるため、
// 可用種別を sortOrder 順、junction のない種別を名前順で末尾へ並べる。
const shiftViewOrder = [
  asc(shifts.date),
  asc(shifts.departmentCode),
  asc(sql`case when ${departmentShiftTypes.sortOrder} is null then 1 else 0 end`),
  asc(departmentShiftTypes.sortOrder),
  asc(shiftTypes.name),
];

function chunkArray<T>(items: T[], size: number = MAX_IN_ARRAY_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 指定された Instructor ID が全て実在するかを検証する（N+1 なし）。
 * 空配列は常に true。ID が多い場合はバインドパラメータ上限を超えないようチャンク分割して問い合わせる。
 * 割り当て対象の妥当性チェックに使う。
 */
async function allInstructorsExist(db: Database, ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  let foundCount = 0;
  for (const chunk of chunkArray(ids)) {
    const rows = await db
      .select({ id: instructors.id })
      .from(instructors)
      .where(inArray(instructors.id, chunk));
    foundCount += rows.length;
  }
  return foundCount === ids.length;
}

/** 指定枠が資格要件を持つか、および枠 ID を取得する。 */
async function findFrameQualificationRequirement(
  db: Database,
  departmentCode: string,
  shiftTypeId: string,
): Promise<{ frameId: string; isRequired: boolean }> {
  const [frame] = await db
    .select({ id: departmentShiftTypes.id })
    .from(departmentShiftTypes)
    .where(
      and(
        eq(departmentShiftTypes.departmentCode, departmentCode),
        eq(departmentShiftTypes.shiftTypeId, shiftTypeId),
      ),
    )
    .limit(1);

  if (!frame) {
    throw new HTTPException(400, { message: '部門で利用できないシフト種別が含まれています' });
  }

  const [requirement] = await db
    .select({ id: certificationRequirements.id })
    .from(certificationRequirements)
    .where(eq(certificationRequirements.departmentShiftTypeId, frame.id))
    .limit(1);

  return { frameId: frame.id, isRequired: requirement !== undefined };
}

/**
 * 資格要件が有効な枠の編集候補を取得する。
 * ACTIVE の資格保有者に加え、候補外でも既に割り当て済みの Instructor を含める。
 */
async function selectCandidatesForQualifiedFrame(
  db: Database,
  candidateIds: string[],
  assignedInstructorIds: string[],
  departmentCode: string,
) {
  if (candidateIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: instructors.id,
      lastName: instructors.lastName,
      firstName: instructors.firstName,
      lastNameKana: instructors.lastNameKana,
      firstNameKana: instructors.firstNameKana,
      status: instructors.status,
      certShortName: certifications.shortName,
    })
    .from(instructors)
    .leftJoin(instructorCertifications, eq(instructorCertifications.instructorId, instructors.id))
    .leftJoin(
      certifications,
      and(
        eq(certifications.id, instructorCertifications.certificationId),
        eq(certifications.departmentCode, departmentCode),
        eq(certifications.isActive, true),
      ),
    )
    .where(
      and(
        inArray(instructors.id, candidateIds),
        or(eq(instructors.status, 'ACTIVE'), inArray(instructors.id, assignedInstructorIds)),
      ),
    )
    .orderBy(asc(instructors.lastName), asc(instructors.firstName));
}

/**
 * 指定期間 [from, to]（両端含む）のシフトを表示ビュー用に整形する（2クエリ・N+1 なし）。
 * shifts × shiftTypes を JOIN し、割り当てを別クエリでまとめて付与する。
 * カレンダービュー（月次）が使う読み取りロジック。
 */
async function loadShiftView(db: Database, from: Date, to: Date): Promise<ShiftViewItem[]> {
  const shiftRows = await db
    .select({
      id: shifts.id,
      date: shifts.date,
      description: shifts.description,
      departmentCode: shifts.departmentCode,
      shiftTypeId: shiftTypes.id,
      shiftTypeName: shiftTypes.name,
    })
    .from(shifts)
    .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId))
    .leftJoin(
      departmentShiftTypes,
      and(
        eq(departmentShiftTypes.departmentCode, shifts.departmentCode),
        eq(departmentShiftTypes.shiftTypeId, shifts.shiftTypeId),
      ),
    )
    .where(and(gte(shifts.date, from), lte(shifts.date, to)))
    .orderBy(...shiftViewOrder);

  // 割り当ては shiftId の inArray ではなく、シフト本体と同じ日付範囲条件で shifts へ
  // innerJoin して絞り込む（バインドパラメータ数を件数に依存させないため）。
  const assignRows =
    shiftRows.length > 0
      ? await db
          .select({
            shiftId: shiftAssignments.shiftId,
            instructorId: instructors.id,
            lastName: instructors.lastName,
            firstName: instructors.firstName,
          })
          .from(shiftAssignments)
          .innerJoin(instructors, eq(instructors.id, shiftAssignments.instructorId))
          .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
          .where(and(gte(shifts.date, from), lte(shifts.date, to)))
      : [];

  // shiftId → 割り当て済み Instructor（表示名付き）のマップを1パスで構築する
  const assignedByShift = new Map<string, { id: string; displayName: string }[]>();
  for (const row of assignRows) {
    const list = assignedByShift.get(row.shiftId) ?? [];
    list.push({
      id: row.instructorId,
      displayName: formatName(row.lastName, row.firstName),
    });
    assignedByShift.set(row.shiftId, list);
  }

  return shiftRows.map((s) => {
    const code = departmentCodeSchema.parse(s.departmentCode);
    return {
      id: s.id,
      date: formatDate(s.date),
      description: s.description,
      department: {
        name: DEPARTMENT_LABELS[code],
        code,
      },
      shiftType: { id: s.shiftTypeId, name: s.shiftTypeName },
      assignedInstructors: assignedByShift.get(s.id) ?? [],
    };
  });
}

/**
 * 指定された日付群のシフトを表示ビュー用に整形する（2クエリ・N+1 なし）。
 * アジェンダでは先に稼働日だけをページングし、その日付群に属する Shift 詳細だけを取得する。
 */
async function loadShiftViewByDates(
  db: Database,
  dates: Date[],
  departmentCode: string | undefined,
): Promise<ShiftViewItem[]> {
  if (dates.length === 0) {
    return [];
  }

  const conditions = [inArray(shifts.date, dates)];
  if (departmentCode) {
    conditions.push(eq(shifts.departmentCode, departmentCode));
  }

  const shiftRows = await db
    .select({
      id: shifts.id,
      date: shifts.date,
      description: shifts.description,
      departmentCode: shifts.departmentCode,
      shiftTypeId: shiftTypes.id,
      shiftTypeName: shiftTypes.name,
    })
    .from(shifts)
    .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId))
    .leftJoin(
      departmentShiftTypes,
      and(
        eq(departmentShiftTypes.departmentCode, shifts.departmentCode),
        eq(departmentShiftTypes.shiftTypeId, shifts.shiftTypeId),
      ),
    )
    .where(and(...conditions))
    .orderBy(...shiftViewOrder);

  // 割り当ては shiftId の inArray ではなく、シフト本体と同じ絞り込み条件（日付群 + 任意の部門）で
  // shifts へ innerJoin する（バインドパラメータ数を件数に依存させないため）。
  const assignRows =
    shiftRows.length > 0
      ? await db
          .select({
            shiftId: shiftAssignments.shiftId,
            instructorId: instructors.id,
            lastName: instructors.lastName,
            firstName: instructors.firstName,
          })
          .from(shiftAssignments)
          .innerJoin(instructors, eq(instructors.id, shiftAssignments.instructorId))
          .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
          .where(and(...conditions))
          .orderBy(asc(instructors.lastName), asc(instructors.firstName))
      : [];

  const assignedByShift = new Map<string, { id: string; displayName: string }[]>();
  for (const row of assignRows) {
    const list = assignedByShift.get(row.shiftId) ?? [];
    list.push({
      id: row.instructorId,
      displayName: formatName(row.lastName, row.firstName),
    });
    assignedByShift.set(row.shiftId, list);
  }

  return shiftRows.map((s) => {
    const code = departmentCodeSchema.parse(s.departmentCode);
    return {
      id: s.id,
      date: formatDate(s.date),
      description: s.description,
      department: {
        name: DEPARTMENT_LABELS[code],
        code,
      },
      shiftType: { id: s.shiftTypeId, name: s.shiftTypeName },
      assignedInstructors: assignedByShift.get(s.id) ?? [],
    };
  });
}

/** アジェンダの `limit` クエリを過大取得にならない範囲へ丸める */
function parseAgendaLimit(value: string | undefined): number {
  if (!value) {
    return 14;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 14;
  }
  return Math.min(parsed, 60);
}

/** 一覧の `limit` クエリを過大取得にならない範囲へ丸める（既定100・上限200） */
function parseListLimit(value: string | undefined): number {
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 200;
  if (!value) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Shift + ShiftAssignment の Hono ルート（ADR 0005）。
 * Shift 本体と複数割り当ての作成/更新は `db.batch` で原子的に行う（ADR 0006）。
 * 重複枠は DB ユニーク制約（date × 部門 × 種別）で弾き、UNIQUE 違反は 409 に変換する。
 * レスポンスは生データ + HTTP ステータス。書き込み系は MANAGER 以上を要求する。
 */
export const shiftsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** 自動割当ソルバーが必要とする候補・資格・可用性・既存割当を集約して返す。 */
  .get('/auto-assign-context', requireAuth, requireRole('MANAGER'), async (c) => {
    const departmentCodeResult = departmentCodeSchema.safeParse(c.req.query('departmentCode'));
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (
      !departmentCodeResult.success ||
      !from ||
      !to ||
      !dateStringSchema.safeParse(from).success ||
      !dateStringSchema.safeParse(to).success ||
      !isValidCalendarDate(from) ||
      !isValidCalendarDate(to) ||
      from > to
    ) {
      throw new HTTPException(400, {
        message: 'departmentCode, from, to を正しい期間で指定してください',
      });
    }

    const departmentCode = departmentCodeResult.data;
    const db = createDb(c.env.DB);
    const [candidateRows, frameRows] = await Promise.all([
      db
        .select({
          id: instructors.id,
          lastName: instructors.lastName,
          firstName: instructors.firstName,
          certificationId: certifications.id,
          linkedUserId: users.id,
        })
        .from(instructors)
        .innerJoin(
          instructorCertifications,
          eq(instructorCertifications.instructorId, instructors.id),
        )
        .innerJoin(certifications, eq(certifications.id, instructorCertifications.certificationId))
        .leftJoin(users, eq(users.instructorId, instructors.id))
        .where(
          and(
            eq(instructors.status, 'ACTIVE'),
            eq(certifications.departmentCode, departmentCode),
            eq(certifications.isActive, true),
          ),
        )
        .orderBy(asc(instructors.lastName), asc(instructors.firstName), asc(instructors.id)),
      db
        .select({
          frameId: departmentShiftTypes.id,
          shiftTypeId: departmentShiftTypes.shiftTypeId,
          certificationId: certificationRequirements.certificationId,
          tierRank: certificationRequirements.tierRank,
        })
        .from(departmentShiftTypes)
        .leftJoin(
          certificationRequirements,
          eq(certificationRequirements.departmentShiftTypeId, departmentShiftTypes.id),
        )
        .where(eq(departmentShiftTypes.departmentCode, departmentCode))
        .orderBy(asc(departmentShiftTypes.sortOrder), asc(certificationRequirements.tierRank)),
    ]);

    const instructorById = new Map<
      string,
      { id: string; displayName: string; certificationIds: string[]; linkedUserId: string | null }
    >();
    for (const row of candidateRows) {
      const instructor = instructorById.get(row.id);
      if (instructor) {
        instructor.certificationIds.push(row.certificationId);
      } else {
        instructorById.set(row.id, {
          id: row.id,
          displayName: formatName(row.lastName, row.firstName),
          certificationIds: [row.certificationId],
          linkedUserId: row.linkedUserId,
        });
      }
    }
    const candidateIds = [...instructorById.keys()];
    const targetFrom = parseShiftDate(from);
    const targetTo = parseShiftDate(to);
    const availabilityRows: {
      instructorId: string;
      date: Date;
      type: 'UNAVAILABLE' | 'AVOID';
      note: string | null;
    }[] = [];
    for (const chunk of chunkArray(candidateIds)) {
      const rows = await db
        .select({
          instructorId: instructorAvailabilities.instructorId,
          date: instructorAvailabilities.date,
          type: instructorAvailabilities.type,
          note: instructorAvailabilities.note,
        })
        .from(instructorAvailabilities)
        .where(
          and(
            inArray(instructorAvailabilities.instructorId, chunk),
            gte(instructorAvailabilities.date, targetFrom),
            lte(instructorAvailabilities.date, targetTo),
          ),
        );
      availabilityRows.push(...rows);
    }
    const submittedInstructorIds = new Set(availabilityRows.map((row) => row.instructorId));

    const framesById = new Map<
      string,
      {
        shiftTypeId: string;
        certificationTiers: { certificationId: string; tierRank: number }[];
      }
    >();
    for (const row of frameRows) {
      const frame = framesById.get(row.frameId) ?? {
        shiftTypeId: row.shiftTypeId,
        certificationTiers: [],
      };
      if (row.certificationId !== null && row.tierRank !== null) {
        frame.certificationTiers.push({
          certificationId: row.certificationId,
          tierRank: row.tierRank,
        });
      }
      framesById.set(row.frameId, frame);
    }
    const frames = await Promise.all(
      [...framesById.entries()].map(async ([frameId, frame]) => ({
        ...frame,
        // #191 の共有クエリを使い、枠の資格を満たす ACTIVE 候補を一貫して求める。
        eligibleInstructorIds: await selectInstructorIdsWithFrameCertification(db, frameId),
      })),
    );

    const seasonRange = seasonRangeForDate(
      from,
      parseSeasonMonth(c.env.WORKLOAD_SEASON_START_MONTH, 12),
      parseSeasonMonth(c.env.WORKLOAD_SEASON_END_MONTH, 4),
    );
    const assignmentRows: {
      date: Date;
      departmentCode: string;
      shiftTypeId: string;
      instructorId: string;
    }[] = [];
    for (const chunk of chunkArray(candidateIds)) {
      const rows = await db
        .select({
          date: shifts.date,
          departmentCode: shifts.departmentCode,
          shiftTypeId: shifts.shiftTypeId,
          instructorId: shiftAssignments.instructorId,
        })
        .from(shiftAssignments)
        .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
        .where(
          and(
            inArray(shiftAssignments.instructorId, chunk),
            gte(shifts.date, parseShiftDate(seasonRange.from)),
            lte(shifts.date, parseShiftDate(seasonRange.to)),
          ),
        );
      assignmentRows.push(...rows);
    }
    const assignmentsByShift = new Map<
      string,
      { date: string; departmentCode: string; shiftTypeId: string; instructorIds: string[] }
    >();
    for (const row of assignmentRows) {
      const date = formatDate(row.date);
      const key = `${date}:${row.departmentCode}:${row.shiftTypeId}`;
      const assignment = assignmentsByShift.get(key) ?? {
        date,
        departmentCode: row.departmentCode,
        shiftTypeId: row.shiftTypeId,
        instructorIds: [],
      };
      assignment.instructorIds.push(row.instructorId);
      assignmentsByShift.set(key, assignment);
    }

    return c.json({
      departmentCode,
      period: { from, to },
      instructors: [...instructorById.values()].map((instructor) => ({
        id: instructor.id,
        displayName: instructor.displayName,
        certificationIds: instructor.certificationIds,
        availabilityStatus: instructor.linkedUserId
          ? submittedInstructorIds.has(instructor.id)
            ? 'SUBMITTED'
            : 'NOT_SUBMITTED'
          : 'NOT_LINKED',
      })),
      frames,
      availabilities: availabilityRows.map((row) => ({
        instructorId: row.instructorId,
        date: formatDate(row.date),
        type: row.type,
        note: row.note,
      })),
      existingAssignments: [...assignmentsByShift.values()].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
    });
  })
  /**
   * シフト作成フォームの集約データを返す（1リクエスト・N+1 なし）。
   */
  .get('/creation-context', requireAuth, async (c) => {
    const departmentCodeResult = departmentCodeSchema.safeParse(c.req.query('departmentCode'));
    if (!departmentCodeResult.success) {
      throw new HTTPException(400, { message: '不正な部門コードです' });
    }
    const departmentCode = departmentCodeResult.data;
    const db = createDb(c.env.DB);

    const [shiftTypeRows, activeCountRows] = await Promise.all([
      db
        .select({ id: shiftTypes.id, name: shiftTypes.name })
        .from(departmentShiftTypes)
        .innerJoin(shiftTypes, eq(shiftTypes.id, departmentShiftTypes.shiftTypeId))
        .where(
          and(
            eq(departmentShiftTypes.departmentCode, departmentCode),
            eq(shiftTypes.isActive, true),
          ),
        )
        .orderBy(asc(departmentShiftTypes.sortOrder)),
      db.select({ value: count() }).from(instructors).where(eq(instructors.status, 'ACTIVE')),
    ]);

    const activeInstructorsCount = activeCountRows[0]?.value ?? 0;

    return c.json({
      shiftTypes: shiftTypeRows,
      stats: {
        activeInstructorsCount,
        totalShiftTypes: shiftTypeRows.length,
      },
    });
  })
  /**
   * シフト編集フォームの集約データを返す（1リクエスト・N+1 なし）。
   * (date, departmentCode, shiftTypeId) から既存 Shift を引いて create/edit を判定し、
   * 対象部門の割り当て候補 Instructor（資格フィルタ済み・割り当て/競合状態付き）を返す。
   */
  .get('/assignment-editor', requireAuth, requireRole('MANAGER'), async (c) => {
    const dateStr = c.req.query('date');
    const departmentCode = c.req.query('departmentCode');
    const shiftTypeId = c.req.query('shiftTypeId');

    if (!(dateStr && departmentCode && shiftTypeId)) {
      throw new HTTPException(400, {
        message: 'date, departmentCode, shiftTypeId は必須です',
      });
    }
    if (!departmentCodeSchema.safeParse(departmentCode).success) {
      throw new HTTPException(400, { message: '不正な部門コードです' });
    }
    if (!dateStringSchema.safeParse(dateStr).success) {
      throw new HTTPException(400, {
        message: '日付は YYYY-MM-DD 形式で指定してください',
      });
    }

    const db = createDb(c.env.DB);
    const date = parseShiftDate(dateStr);

    // 既存 Shift を引いて mode を判定する
    const [existingShift] = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.date, date),
          eq(shifts.departmentCode, departmentCode),
          eq(shifts.shiftTypeId, shiftTypeId),
        ),
      )
      .limit(1);

    const mode = existingShift ? 'edit' : 'create';

    // 既存 Shift の割り当て済み Instructor ID
    let assignedInstructorIds: string[] = [];
    if (existingShift) {
      const assignRows = await db
        .select({ instructorId: shiftAssignments.instructorId })
        .from(shiftAssignments)
        .where(eq(shiftAssignments.shiftId, existingShift.id));
      assignedInstructorIds = assignRows.map((r) => r.instructorId);
    }

    const frameRequirement = await findFrameQualificationRequirement(
      db,
      departmentCode,
      shiftTypeId,
    );
    const qualifiedCandidateIds = frameRequirement.isRequired
      ? await selectInstructorIdsWithFrameCertification(db, frameRequirement.frameId)
      : [];
    const qualifiedCandidateSet = new Set(qualifiedCandidateIds);

    // 資格要件がない枠は従来どおり部門資格で絞る。要件がある枠では #191 の共有クエリを
    // 利用し、既存割り当ては候補外でも再保存・解除できるよう結果に残す。
    const candidateRows = frameRequirement.isRequired
      ? await selectCandidatesForQualifiedFrame(
          db,
          [...new Set([...qualifiedCandidateIds, ...assignedInstructorIds])],
          assignedInstructorIds,
          departmentCode,
        )
      : await db
          .select({
            id: instructors.id,
            lastName: instructors.lastName,
            firstName: instructors.firstName,
            lastNameKana: instructors.lastNameKana,
            firstNameKana: instructors.firstNameKana,
            status: instructors.status,
            certShortName: certifications.shortName,
          })
          .from(instructors)
          .innerJoin(
            instructorCertifications,
            eq(instructorCertifications.instructorId, instructors.id),
          )
          .innerJoin(
            certifications,
            eq(certifications.id, instructorCertifications.certificationId),
          )
          .where(
            and(
              eq(instructors.status, 'ACTIVE'),
              eq(certifications.departmentCode, departmentCode),
              eq(certifications.isActive, true),
            ),
          )
          .orderBy(asc(instructors.lastName), asc(instructors.firstName));

    // 同日の別 Shift（競合候補）と、その割り当てを取得する
    const otherShiftRows = await db
      .select({
        id: shifts.id,
        departmentCode: shifts.departmentCode,
        shiftTypeName: shiftTypes.name,
      })
      .from(shifts)
      .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId))
      .where(
        existingShift
          ? and(eq(shifts.date, date), ne(shifts.id, existingShift.id))
          : eq(shifts.date, date),
      );

    // otherShiftIds の inArray ではなく、shifts へ同日条件で innerJoin して絞り込む
    // （同日の別 Shift 数自体は少ないが、JOIN の方が inArray の件数上限を気にせず済み自然）
    const otherAssignRows =
      otherShiftRows.length > 0
        ? await db
            .select({
              shiftId: shiftAssignments.shiftId,
              instructorId: shiftAssignments.instructorId,
            })
            .from(shiftAssignments)
            .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
            .where(
              existingShift
                ? and(eq(shifts.date, date), ne(shifts.id, existingShift.id))
                : eq(shifts.date, date),
            )
        : [];

    // instructorId → 競合先 Shift 情報（最初の1件）のマップを構築する
    const conflictShiftById = new Map(otherShiftRows.map((s) => [s.id, s]));
    const conflictByInstructor = new Map<
      string,
      { id: string; departmentCode: string; shiftTypeName: string }
    >();
    for (const row of otherAssignRows) {
      if (!conflictByInstructor.has(row.instructorId)) {
        const shift = conflictShiftById.get(row.shiftId);
        if (shift) {
          conflictByInstructor.set(row.instructorId, shift);
        }
      }
    }

    // Instructor ごとに候補をグルーピングし、資格略称をまとめる
    const assignedSet = new Set(assignedInstructorIds);
    type Candidate = {
      id: string;
      displayName: string;
      displayNameKana: string | null;
      status: string;
      certShortNames: string[];
      isAssigned: boolean;
      hasConflict: boolean;
    };
    const candidateMap = new Map<string, Candidate>();
    for (const row of candidateRows) {
      const existing = candidateMap.get(row.id);
      if (existing) {
        if (row.certShortName) {
          existing.certShortNames.push(row.certShortName);
        }
      } else {
        candidateMap.set(row.id, {
          id: row.id,
          displayName: formatName(row.lastName, row.firstName),
          displayNameKana: formatNameKana(row.lastNameKana, row.firstNameKana),
          status: row.status,
          certShortNames: row.certShortName ? [row.certShortName] : [],
          isAssigned: assignedSet.has(row.id),
          hasConflict: conflictByInstructor.has(row.id),
        });
      }
    }

    const availableInstructors = Array.from(candidateMap.values()).map((cand) => ({
      id: cand.id,
      displayName: cand.displayName,
      displayNameKana: cand.displayNameKana,
      status: cand.status,
      certifications: cand.certShortNames,
      isAssigned: cand.isAssigned,
      hasConflict: cand.hasConflict,
      hasQualificationWarning:
        frameRequirement.isRequired && cand.isAssigned && !qualifiedCandidateSet.has(cand.id),
    }));

    const seasonRange = seasonRangeForDate(
      dateStr,
      parseSeasonMonth(c.env.WORKLOAD_SEASON_START_MONTH, 12),
      parseSeasonMonth(c.env.WORKLOAD_SEASON_END_MONTH, 4),
    );
    // candidateIds が多い場合に備え、日付範囲の2パラメータ分の余裕を見てチャンク分割して問い合わせる
    const candidateIds = availableInstructors.map((inst) => inst.id);
    const workloadRows: { instructorId: string; date: Date }[] = [];
    for (const chunk of chunkArray(candidateIds)) {
      const rows = await db
        .select({
          instructorId: shiftAssignments.instructorId,
          date: shifts.date,
        })
        .from(shiftAssignments)
        .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
        .where(
          and(
            inArray(shiftAssignments.instructorId, chunk),
            gte(shifts.date, parseShiftDate(seasonRange.from)),
            lte(shifts.date, parseShiftDate(seasonRange.to)),
          ),
        );
      workloadRows.push(...rows);
    }

    // 対象月（dateStr の年月）を除いた保存済みシーズン勤務日数を Instructor 別に数える。
    // 対象月分はステージ中の未保存編集を含めてクライアント側でライブ計算し、この値と合算する。
    const targetMonth = dateStr.slice(0, 7);
    const outsideMonthDatesByInstructor = new Map<string, Set<string>>();
    for (const row of workloadRows) {
      const date = formatDate(row.date);
      if (date.slice(0, 7) === targetMonth) {
        continue;
      }
      const dates = outsideMonthDatesByInstructor.get(row.instructorId) ?? new Set<string>();
      dates.add(date);
      outsideMonthDatesByInstructor.set(row.instructorId, dates);
    }

    const availableInstructorsWithLoad = availableInstructors.map((inst) => ({
      ...inst,
      seasonWorkDaysOutsideMonth: outsideMonthDatesByInstructor.get(inst.id)?.size ?? 0,
    }));

    const conflicts = availableInstructorsWithLoad
      .filter((inst) => inst.hasConflict)
      .map((inst) => {
        const conflictShift = conflictByInstructor.get(inst.id);
        if (!conflictShift) {
          return null;
        }
        return {
          instructorId: inst.id,
          instructorName: inst.displayName,
          conflictingShift: {
            id: conflictShift.id,
            departmentName:
              DEPARTMENT_LABELS[departmentCodeSchema.parse(conflictShift.departmentCode)],
            shiftTypeName: conflictShift.shiftTypeName,
          },
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return c.json({
      mode,
      shift: existingShift
        ? {
            id: existingShift.id,
            date: formatDate(existingShift.date),
            departmentCode: existingShift.departmentCode,
            shiftTypeId: existingShift.shiftTypeId,
            description: existingShift.description,
            assignedInstructorIds,
          }
        : null,
      availableInstructors: availableInstructorsWithLoad,
      conflicts,
    });
  })
  /**
   * アジェンダビュー: 起点日から未来/過去方向へ、Shift が 1 件以上ある稼働日だけを返す。
   * 休校日は日付行自体を返さず、各稼働日の Shift は部門 × シフト種別でまとめて返す。
   */
  .get('/agenda', requireAuth, async (c) => {
    const cursor = c.req.query('cursor');
    const directionQuery = c.req.query('direction') ?? 'future';
    const departmentCode = c.req.query('departmentCode');

    if (!(cursor && dateStringSchema.safeParse(cursor).success)) {
      throw new HTTPException(400, {
        message: 'cursor は YYYY-MM-DD 形式で指定してください',
      });
    }
    const directionResult = shiftAgendaDirectionSchema.safeParse(directionQuery);
    if (!directionResult.success) {
      throw new HTTPException(400, {
        message: 'direction は future または past を指定してください',
      });
    }
    if (departmentCode && !departmentCodeSchema.safeParse(departmentCode).success) {
      throw new HTTPException(400, { message: 'departmentCode が不正です' });
    }

    const direction = directionResult.data;
    const limit = parseAgendaLimit(c.req.query('limit'));
    const db = createDb(c.env.DB);
    const cursorDate = parseShiftDate(cursor);
    const dateConditions = [
      direction === 'future' ? gte(shifts.date, cursorDate) : lt(shifts.date, cursorDate),
    ];
    if (departmentCode) {
      dateConditions.push(eq(shifts.departmentCode, departmentCode));
    }

    const dateRows = await db
      .select({ date: shifts.date })
      .from(shifts)
      .where(and(...dateConditions))
      .groupBy(shifts.date)
      .orderBy(direction === 'future' ? asc(shifts.date) : desc(shifts.date))
      .limit(limit);

    const pageDates =
      direction === 'future'
        ? dateRows.map((row) => row.date)
        : dateRows.map((row) => row.date).reverse();
    const shiftsView = await loadShiftViewByDates(db, pageDates, departmentCode);
    const days = groupShiftsByWorkingDay(shiftsView);
    const firstDay = days[0];
    const lastDay = days.at(-1);

    return c.json({
      days,
      pageInfo: {
        direction,
        limit,
        nextCursor: lastDay ? addDays(lastDay.date, 1) : null,
        previousCursor: firstDay ? firstDay.date : null,
      },
    });
  })
  /**
   * 月次カレンダー: `month`（YYYY-MM）の当月シフトとサマリを1リクエストで返す。
   * データと集計を同梱する。MEMBER 以上。
   */
  .get('/calendar', requireAuth, async (c) => {
    const month = c.req.query('month');
    if (!(month && monthStringSchema.safeParse(month).success)) {
      throw new HTTPException(400, {
        message: 'month は YYYY-MM 形式で指定してください',
      });
    }

    // monthStringSchema が形式と月範囲（01〜12）を検証済み
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNumber = Number(monthStr);

    const db = createDb(c.env.DB);
    // 当月の初日〜末日（UTC 基準）。翌月0日が当月末日になる。
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 0));

    const shiftsView = await loadShiftView(db, from, to);
    return c.json({
      shifts: shiftsView,
      summary: summarizeShifts(shiftsView, {
        from: formatDate(from),
        to: formatDate(to),
      }),
    });
  })
  /**
   * シフト一覧を返す。`dateFrom`/`dateTo`（YYYY-MM-DD）で期間を、`instructorId` で
   * その Instructor が割り当てられたシフトのみに絞り込める。
   * `limit` で返却件数の上限を指定できる（既定100・上限200）。期間・件数のどちらも
   * 無指定のまま全件返却してしまわないよう、`limit` には常に既定値が入る。
   * 部門・シフト種別名を JOIN で同梱し、割り当て済み Instructor ID を付与する（N+1 なし）。
   */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const instructorId = c.req.query('instructorId');
    const limit = parseListLimit(c.req.query('limit'));

    const conditions = [];
    if (dateFrom && dateStringSchema.safeParse(dateFrom).success) {
      conditions.push(gte(shifts.date, parseShiftDate(dateFrom)));
    }
    if (dateTo && dateStringSchema.safeParse(dateTo).success) {
      conditions.push(lte(shifts.date, parseShiftDate(dateTo)));
    }
    if (instructorId) {
      // 割り当て済み Shift ID を全件取得して inArray するのではなく、
      // EXISTS サブクエリで「この Shift に対する当該 Instructor の割り当てがあるか」を判定する
      conditions.push(
        exists(
          db
            .select({ shiftId: shiftAssignments.shiftId })
            .from(shiftAssignments)
            .where(
              and(
                eq(shiftAssignments.shiftId, shifts.id),
                eq(shiftAssignments.instructorId, instructorId),
              ),
            ),
        ),
      );
    }

    const baseQuery = db
      .select({
        id: shifts.id,
        date: shifts.date,
        departmentCode: shifts.departmentCode,
        shiftTypeId: shifts.shiftTypeId,
        description: shifts.description,
        createdAt: shifts.createdAt,
        updatedAt: shifts.updatedAt,
        shiftTypeName: shiftTypes.name,
      })
      .from(shifts)
      .innerJoin(shiftTypes, eq(shiftTypes.id, shifts.shiftTypeId));

    // date だけだと同日中の順序が不定になるため、id を第2ソートキーにして
    // ページ境界（limit による切り捨て位置）を決定的にする
    const shiftRows =
      conditions.length > 0
        ? await baseQuery
            .where(and(...conditions))
            .orderBy(asc(shifts.date), asc(shifts.id))
            .limit(limit)
        : await baseQuery.orderBy(asc(shifts.date), asc(shifts.id)).limit(limit);

    // 割り当ては期間条件で再絞り込みするのではなく、返却ページに含まれる shiftId だけを
    // 対象にする（limit で絞ったのに割り当て取得だけ期間内全件になってしまうのを防ぐ）。
    // shiftRows は limit で有界なので inArray で安全だが、D1 のバインドパラメータ上限
    // （100個）を超えないよう chunkArray でチャンク分割して問い合わせる。
    const shiftIds = shiftRows.map((s) => s.id);
    const assignRows: { shiftId: string; instructorId: string }[] = [];
    for (const chunk of chunkArray(shiftIds)) {
      const rows = await db
        .select({
          shiftId: shiftAssignments.shiftId,
          instructorId: shiftAssignments.instructorId,
        })
        .from(shiftAssignments)
        .where(inArray(shiftAssignments.shiftId, chunk));
      assignRows.push(...rows);
    }

    const assignedByShift = new Map<string, string[]>();
    for (const row of assignRows) {
      const list = assignedByShift.get(row.shiftId);
      if (list) {
        list.push(row.instructorId);
      } else {
        assignedByShift.set(row.shiftId, [row.instructorId]);
      }
    }

    return c.json(
      shiftRows.map((s) => ({
        ...s,
        departmentName: DEPARTMENT_LABELS[departmentCodeSchema.parse(s.departmentCode)],
        assignedInstructorIds: assignedByShift.get(s.id) ?? [],
      })),
    );
  })
  /**
   * (month × 部門) の割り当てを月次まとめて upsert する（MANAGER 以上）。
   * cells には変更差分のみを含める。全セル分の書き込みを単一の `db.batch` に集約し、
   * 途中で失敗しても部分コミットが残らない原子性を保証する。
   * instructorIds が空なら該当 Shift を削除する（ShiftAssignment は cascade で消える）。
   */
  .put(
    '/assignments',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = upsertMonthlyAssignmentsSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      // 全セルの日付が実在する暦日で、かつ対象月内にあることを検証
      for (const cell of input.cells) {
        if (!isValidCalendarDate(cell.date)) {
          throw new HTTPException(400, {
            message: `セルの日付 ${cell.date} は実在しない日付です`,
          });
        }
        if (!cell.date.startsWith(`${input.month}-`)) {
          throw new HTTPException(400, {
            message: `セルの日付 ${cell.date} は対象月 ${input.month} の範囲外です`,
          });
        }
      }

      if (input.cells.length === 0) {
        return c.json({ upsertedCount: 0, deletedCount: 0 });
      }

      const shiftTypeIds = [...new Set(input.cells.map((cell) => cell.shiftTypeId))];
      const availableRows = await db
        .select({ shiftTypeId: departmentShiftTypes.shiftTypeId, frameId: departmentShiftTypes.id })
        .from(departmentShiftTypes)
        .where(
          and(
            eq(departmentShiftTypes.departmentCode, input.departmentCode),
            inArray(departmentShiftTypes.shiftTypeId, shiftTypeIds),
          ),
        );
      if (availableRows.length !== shiftTypeIds.length) {
        throw new HTTPException(400, { message: '部門で利用できないシフト種別が含まれています' });
      }
      const frameIdByShiftTypeId = new Map(
        availableRows.map((row) => [row.shiftTypeId, row.frameId]),
      );

      // 全セルで参照される Instructor が実在するかを1クエリで検証
      const uniqueInstructorIds = [...new Set(input.cells.flatMap((cell) => cell.instructorIds))];
      if (!(await allInstructorsExist(db, uniqueInstructorIds))) {
        throw new HTTPException(400, {
          message: 'One or more instructors do not exist',
        });
      }

      // 対象月×部門の既存 Shift を1クエリで引き、(date × shiftTypeId) → id にマップする
      const [yearStr, monthStr] = input.month.split('-');
      const year = Number(yearStr);
      const monthNumber = Number(monthStr);
      const monthFrom = new Date(Date.UTC(year, monthNumber - 1, 1));
      const monthTo = new Date(Date.UTC(year, monthNumber, 0));

      const existingRows = await db
        .select({
          id: shifts.id,
          date: shifts.date,
          shiftTypeId: shifts.shiftTypeId,
        })
        .from(shifts)
        .where(
          and(
            eq(shifts.departmentCode, input.departmentCode),
            gte(shifts.date, monthFrom),
            lte(shifts.date, monthTo),
          ),
        );

      const existingByKey = new Map<string, string>();
      for (const row of existingRows) {
        existingByKey.set(`${formatDate(row.date)}:${row.shiftTypeId}`, row.id);
      }

      // 既存ペアとの差分だけを資格要件の対象にする。これにより資格設定より前の
      // 割り当ては再保存・解除できる一方、新規に追加する無資格者だけを拒否できる。
      const existingInstructorIdsByShiftId = new Map<string, Set<string>>();
      for (const chunk of chunkArray(existingRows.map((row) => row.id))) {
        const assignmentRows = await db
          .select({
            shiftId: shiftAssignments.shiftId,
            instructorId: shiftAssignments.instructorId,
          })
          .from(shiftAssignments)
          .where(inArray(shiftAssignments.shiftId, chunk));
        for (const row of assignmentRows) {
          const ids = existingInstructorIdsByShiftId.get(row.shiftId) ?? new Set<string>();
          ids.add(row.instructorId);
          existingInstructorIdsByShiftId.set(row.shiftId, ids);
        }
      }

      const requiredFrameIds = new Set<string>();
      for (const row of await db
        .select({ frameId: certificationRequirements.departmentShiftTypeId })
        .from(certificationRequirements)
        .where(
          inArray(certificationRequirements.departmentShiftTypeId, [
            ...new Set(availableRows.map((row) => row.frameId)),
          ]),
        )) {
        requiredFrameIds.add(row.frameId);
      }
      const qualifiedInstructorIdsByFrameId = new Map<string, Set<string>>();
      for (const frameId of requiredFrameIds) {
        qualifiedInstructorIdsByFrameId.set(
          frameId,
          new Set(
            await selectInstructorIdsWithFrameCertification(db, frameId, { activeOnly: false }),
          ),
        );
      }

      for (const cell of input.cells) {
        const frameId = frameIdByShiftTypeId.get(cell.shiftTypeId);
        if (!frameId || !requiredFrameIds.has(frameId)) {
          continue;
        }
        const existingId = existingByKey.get(`${cell.date}:${cell.shiftTypeId}`);
        const existingInstructorIds = existingId
          ? (existingInstructorIdsByShiftId.get(existingId) ?? new Set<string>())
          : new Set<string>();
        const qualifiedInstructorIds =
          qualifiedInstructorIdsByFrameId.get(frameId) ?? new Set<string>();
        const hasUnqualifiedNewAssignment = [...new Set(cell.instructorIds)].some(
          (instructorId) =>
            !existingInstructorIds.has(instructorId) && !qualifiedInstructorIds.has(instructorId),
        );
        if (hasUnqualifiedNewAssignment) {
          throw new HTTPException(400, {
            message: '資格要件を満たさない新規割り当てが含まれています',
          });
        }
      }

      let upsertedCount = 0;
      let deletedCount = 0;

      // 全セル分の操作を1つの db.batch にまとめ、途中失敗時に部分コミットが残らないようにする。
      // D1 の batch API は全ステートメントが単一トランザクションで実行される。
      const batchOps: BatchItem<'sqlite'>[] = [];

      for (const cell of input.cells) {
        const key = `${cell.date}:${cell.shiftTypeId}`;
        const existingId = existingByKey.get(key);
        const uniqueIds = [...new Set(cell.instructorIds)];
        const description = cell.description?.trim() || null;

        if (uniqueIds.length === 0) {
          if (existingId) {
            batchOps.push(db.delete(shifts).where(eq(shifts.id, existingId)));
            deletedCount++;
          }
          continue;
        }

        if (existingId) {
          // 既存 Shift: 備考更新 → 旧割り当て全削除 → 新割り当て挿入。
          batchOps.push(
            db.update(shifts).set({ description }).where(eq(shifts.id, existingId)),
            db.delete(shiftAssignments).where(eq(shiftAssignments.shiftId, existingId)),
            ...uniqueIds.map((instructorId) =>
              db.insert(shiftAssignments).values({ shiftId: existingId, instructorId }),
            ),
          );
          upsertedCount++;
        } else {
          // 新規 Shift: 本体挿入 → 割り当て挿入。
          const date = parseShiftDate(cell.date);
          const shiftId = crypto.randomUUID();
          batchOps.push(
            db.insert(shifts).values({
              id: shiftId,
              date,
              departmentCode: input.departmentCode,
              shiftTypeId: cell.shiftTypeId,
              description,
            }),
            ...uniqueIds.map((instructorId) =>
              db.insert(shiftAssignments).values({ shiftId, instructorId }),
            ),
          );
          upsertedCount++;
        }
      }

      if (batchOps.length === 0) {
        return c.json({ upsertedCount, deletedCount });
      }

      // 空でない配列を要求する db.batch のシグネチャに合わせるための narrowing。
      // 直前に length > 0 を確認済み。
      const [head, ...rest] = batchOps;
      if (!head) {
        return c.json({ upsertedCount, deletedCount });
      }

      try {
        await db.batch([head, ...rest]);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, {
            message: 'Shift uniqueness violated during monthly upsert',
          });
        }
        throw err;
      }

      return c.json({ upsertedCount, deletedCount });
    },
  );
