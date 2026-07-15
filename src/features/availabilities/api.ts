import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { dateStringSchema } from '@/features/shifts/schema';
import { createDb } from '@/server/db/client';
import { instructorAvailabilities, shiftAssignments, shifts, users } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { updateMyAvailabilitiesSchema } from './schema';

/** YYYY-MM-DD 文字列を UTC 0時の Date に正規化する。 */
function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Date を API 境界で用いる YYYY-MM-DD に整形する（UTC 基準）。 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD が実在する暦日か判定する。 */
function isValidCalendarDate(value: string): boolean {
  const [yearString, monthString, dayString] = value.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** クエリの期間を検証し、UTC 0時に正規化して返す。 */
function parseRange(from: string | undefined, to: string | undefined): { from: Date; to: Date } {
  if (
    !from ||
    !to ||
    !dateStringSchema.safeParse(from).success ||
    !dateStringSchema.safeParse(to).success ||
    !isValidCalendarDate(from) ||
    !isValidCalendarDate(to)
  ) {
    throw new HTTPException(400, {
      message: 'from と to は実在する YYYY-MM-DD で指定してください',
    });
  }
  const range = { from: parseDate(from), to: parseDate(to) };
  if (range.from > range.to) {
    throw new HTTPException(400, { message: 'from は to 以前の日付を指定してください' });
  }
  return range;
}

/** JWT のユーザーにリンクした instructorId を解決する。未連携なら本人入力は許可しない。 */
async function resolveInstructorId(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<string> {
  const [user] = await db
    .select({ instructorId: users.instructorId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.instructorId) {
    throw new HTTPException(403, { message: 'インストラクターに紐づくユーザーのみ利用できます' });
  }
  return user.instructorId;
}

/** 当日（UTC）の開始時刻を返す。 */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * インストラクター本人の勤務可否申告と、管理者向け一覧を提供する Hono ルート。
 * 本人の書き込みは未来の未割当日のみ許可し、全変更を単一 batch で原子的に反映する。
 */
export const availabilitiesRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
  /** 本人の申告一覧と、その期間中に割当済みで編集不能な日を返す。 */
  .get('/me', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const instructorId = await resolveInstructorId(db, c.get('user').userId);
    const range = parseRange(c.req.query('from'), c.req.query('to'));

    const [availabilityRows, lockedRows] = await Promise.all([
      db
        .select()
        .from(instructorAvailabilities)
        .where(
          and(
            eq(instructorAvailabilities.instructorId, instructorId),
            gte(instructorAvailabilities.date, range.from),
            lte(instructorAvailabilities.date, range.to),
          ),
        )
        .orderBy(asc(instructorAvailabilities.date)),
      db
        .selectDistinct({ date: shifts.date })
        .from(shiftAssignments)
        .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
        .where(
          and(
            eq(shiftAssignments.instructorId, instructorId),
            gte(shifts.date, range.from),
            lte(shifts.date, range.to),
          ),
        )
        .orderBy(asc(shifts.date)),
    ]);

    return c.json({
      availabilities: availabilityRows.map((row) => ({
        instructorId: row.instructorId,
        date: formatDate(row.date),
        type: row.type,
        note: row.note,
      })),
      lockedDates: lockedRows.map((row) => formatDate(row.date)),
    });
  })
  /** 本人の申告を差分で更新する。type: null の変更は削除として扱う。 */
  .put(
    '/me',
    requireAuth,
    validator('json', (value, c) => {
      const parsed = updateMyAvailabilitiesSchema.safeParse(value);
      if (!parsed.success) return c.json({ message: parsed.error.message }, 400);
      return parsed.data;
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const instructorId = await resolveInstructorId(db, c.get('user').userId);
      const input = c.req.valid('json');
      const minimumDate = today();

      for (const change of input.changes) {
        if (!isValidCalendarDate(change.date)) {
          throw new HTTPException(400, { message: `${change.date} は実在しない日付です` });
        }
        if (parseDate(change.date) < minimumDate) {
          throw new HTTPException(400, { message: '過去日の勤務可否は変更できません' });
        }
      }

      const requestedDates = input.changes.map((change) => parseDate(change.date));
      if (requestedDates.length > 0) {
        const lockedRows = await db
          .selectDistinct({ date: shifts.date })
          .from(shiftAssignments)
          .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
          .where(
            and(
              eq(shiftAssignments.instructorId, instructorId),
              inArray(shifts.date, requestedDates),
            ),
          );
        if (lockedRows.length > 0) {
          throw new HTTPException(409, { message: '割当済み日の勤務可否は変更できません' });
        }
      }

      const operations: BatchItem<'sqlite'>[] = input.changes.map((change) => {
        const date = parseDate(change.date);
        if (change.type === null) {
          return db
            .delete(instructorAvailabilities)
            .where(
              and(
                eq(instructorAvailabilities.instructorId, instructorId),
                eq(instructorAvailabilities.date, date),
              ),
            );
        }
        return db
          .insert(instructorAvailabilities)
          .values({
            instructorId,
            date,
            type: change.type,
            note: change.note?.trim() || null,
          })
          .onConflictDoUpdate({
            target: [instructorAvailabilities.instructorId, instructorAvailabilities.date],
            set: { type: change.type, note: change.note?.trim() || null },
          });
      });

      const [first, ...rest] = operations;
      if (first) await db.batch([first, ...rest]);
      return c.json({ updatedCount: input.changes.length });
    },
  )
  /** 全インストラクターの申告を期間指定で返す（MANAGER 以上）。 */
  .get('/', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const range = parseRange(c.req.query('from'), c.req.query('to'));
    const instructorId = c.req.query('instructorId');
    const conditions = [
      gte(instructorAvailabilities.date, range.from),
      lte(instructorAvailabilities.date, range.to),
    ];
    if (instructorId) conditions.push(eq(instructorAvailabilities.instructorId, instructorId));

    const rows = await db
      .select()
      .from(instructorAvailabilities)
      .where(and(...conditions))
      .orderBy(asc(instructorAvailabilities.date), asc(instructorAvailabilities.instructorId));
    return c.json(
      rows.map((row) => ({
        instructorId: row.instructorId,
        date: formatDate(row.date),
        type: row.type,
        note: row.note,
      })),
    );
  });
