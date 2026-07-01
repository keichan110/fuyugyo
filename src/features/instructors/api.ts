import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import { isUniqueViolation } from '@/server/db/errors';
import { certifications, instructorCertifications, instructors } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import {
  assignCertificationSchema,
  changeInstructorStatusSchema,
  createInstructorSchema,
  updateInstructorSchema,
} from './schema';

/**
 * Instructor CRUD の Hono ルート（ADR 0005）。
 * レスポンスは生データ + HTTP ステータス（`c.json(data, status)`）。
 * エラーは HTTPException で投げ、中央 `onError` が整形する。
 * 書き込み系（POST/PATCH）は MANAGER 以上を要求する。
 */
export const instructorsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /**
   * 部門別アクティブ Instructor を返す（N+1 なし）。
   * 静的セグメントが `:id` より先に評価されるよう、先頭に登録する。
   * 返す certifications は指定 Department に属するアクティブなもののみ。
   */
  .get('/by-department/:departmentId/active', requireAuth, async (c) => {
    const { departmentId } = c.req.param();
    const db = createDb(c.env.DB);

    // 1 回の JOIN クエリで全データを取得してから JS 側でグルーピングする（N+1 回避）
    const rows = await db
      .select({
        id: instructors.id,
        lastName: instructors.lastName,
        firstName: instructors.firstName,
        lastNameKana: instructors.lastNameKana,
        firstNameKana: instructors.firstNameKana,
        status: instructors.status,
        notes: instructors.notes,
        createdAt: instructors.createdAt,
        updatedAt: instructors.updatedAt,
        certId: certifications.id,
        certName: certifications.name,
        certShortName: certifications.shortName,
      })
      .from(instructors)
      .innerJoin(
        instructorCertifications,
        eq(instructorCertifications.instructorId, instructors.id),
      )
      .innerJoin(certifications, eq(certifications.id, instructorCertifications.certificationId))
      .where(
        and(
          eq(instructors.status, 'ACTIVE'),
          eq(certifications.departmentId, departmentId),
          eq(certifications.isActive, true),
        ),
      );

    // JS 側で instructor ごとに certifications をグルーピングする
    type DeptInstructor = {
      id: string;
      lastName: string;
      firstName: string;
      lastNameKana: string | null;
      firstNameKana: string | null;
      status: string;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      certifications: Array<{ id: string; name: string; shortName: string }>;
    };

    const map = new Map<string, DeptInstructor>();
    for (const row of rows) {
      const existing = map.get(row.id);
      if (existing) {
        existing.certifications.push({
          id: row.certId,
          name: row.certName,
          shortName: row.certShortName,
        });
      } else {
        map.set(row.id, {
          id: row.id,
          lastName: row.lastName,
          firstName: row.firstName,
          lastNameKana: row.lastNameKana,
          firstNameKana: row.firstNameKana,
          status: row.status,
          notes: row.notes,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          certifications: [{ id: row.certId, name: row.certName, shortName: row.certShortName }],
        });
      }
    }

    return c.json(Array.from(map.values()));
  })
  /** インストラクター一覧を返す（status=INACTIVE 指定がない限りアクティブのみ） */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const statusFilter = c.req.query('status');

    const rows = statusFilter
      ? await db.select().from(instructors).where(eq(instructors.status, statusFilter))
      : await db.select().from(instructors).where(eq(instructors.status, 'ACTIVE'));

    return c.json(rows);
  })
  /** インストラクターを1件取得する（Certification 一覧付き） */
  .get('/:id', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const id = c.req.param('id');

    const [instructor] = await db.select().from(instructors).where(eq(instructors.id, id)).limit(1);

    if (!instructor) {
      throw new HTTPException(404, { message: 'Instructor not found' });
    }

    const certs = await db
      .select()
      .from(instructorCertifications)
      .where(eq(instructorCertifications.instructorId, id));

    return c.json({ ...instructor, certifications: certs });
  })
  /** インストラクターを作成する（MANAGER 以上） */
  .post(
    '/',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = createInstructorSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      const [created] = await db
        .insert(instructors)
        .values({
          lastName: input.lastName,
          firstName: input.firstName,
          lastNameKana: input.lastNameKana ?? null,
          firstNameKana: input.firstNameKana ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      if (!created) {
        throw new HTTPException(500, { message: 'Failed to create instructor' });
      }
      return c.json(created, 201);
    },
  )
  /** インストラクター情報を更新する（MANAGER 以上） */
  .patch(
    '/:id',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = updateInstructorSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const id = c.req.param('id');

      const [existing] = await db.select().from(instructors).where(eq(instructors.id, id)).limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'Instructor not found' });
      }

      const [updated] = await db
        .update(instructors)
        .set({
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastNameKana !== undefined ? { lastNameKana: input.lastNameKana } : {}),
          ...(input.firstNameKana !== undefined ? { firstNameKana: input.firstNameKana } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(eq(instructors.id, id))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to update instructor' });
      }
      return c.json(updated);
    },
  )
  /** インストラクターのステータスを変更する（MANAGER 以上） */
  .post(
    '/:id/change-status',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = changeInstructorStatusSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const id = c.req.param('id');

      const [existing] = await db.select().from(instructors).where(eq(instructors.id, id)).limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'Instructor not found' });
      }

      const [updated] = await db
        .update(instructors)
        .set({ status: input.status })
        .where(eq(instructors.id, id))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to change instructor status' });
      }
      return c.json(updated);
    },
  )
  /** インストラクターに Certification を割り当てる（MANAGER 以上・ユニーク制約あり） */
  .post(
    '/:id/certifications',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = assignCertificationSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const instructorId = c.req.param('id');

      const [instructor] = await db
        .select({ id: instructors.id })
        .from(instructors)
        .where(eq(instructors.id, instructorId))
        .limit(1);

      if (!instructor) {
        throw new HTTPException(404, { message: 'Instructor not found' });
      }

      const [cert] = await db
        .select({ id: certifications.id })
        .from(certifications)
        .where(eq(certifications.id, input.certificationId))
        .limit(1);

      if (!cert) {
        throw new HTTPException(404, { message: 'Certification not found' });
      }

      try {
        const [created] = await db
          .insert(instructorCertifications)
          .values({ instructorId, certificationId: input.certificationId })
          .returning();

        if (!created) {
          throw new HTTPException(500, { message: 'Failed to assign certification' });
        }
        return c.json(created, 201);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, { message: 'Certification already assigned' });
        }
        throw err;
      }
    },
  )
  /** インストラクターから Certification を解除する（MANAGER 以上） */
  .delete('/:id/certifications/:certId', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const instructorId = c.req.param('id');
    const certId = c.req.param('certId');

    const [existing] = await db
      .select()
      .from(instructorCertifications)
      .where(
        and(
          eq(instructorCertifications.instructorId, instructorId),
          eq(instructorCertifications.certificationId, certId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'Certification assignment not found' });
    }

    await db
      .delete(instructorCertifications)
      .where(
        and(
          eq(instructorCertifications.instructorId, instructorId),
          eq(instructorCertifications.certificationId, certId),
        ),
      );

    return c.json({ message: 'Certification unassigned' });
  });
