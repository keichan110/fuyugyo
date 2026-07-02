import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import { certifications, departments } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { createCertificationSchema, updateCertificationSchema } from './schema';

/**
 * Certification CRUD の Hono ルート（ADR 0005）。
 * レスポンスは生データ + HTTP ステータス（`c.json(data, status)`）。
 * エラーは HTTPException で投げ、中央 `onError` が整形する。
 * 書き込み系（POST/PATCH）は MANAGER 以上を要求する。
 */
export const certificationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** 資格一覧を返す（active=false 指定がない限りアクティブのみ、departmentId で絞り込み可） */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const activeOnly = c.req.query('active') !== 'false';
    const departmentId = c.req.query('departmentId');

    const conditions = [];
    if (activeOnly) {
      conditions.push(eq(certifications.isActive, true));
    }
    if (departmentId) {
      conditions.push(eq(certifications.departmentId, departmentId));
    }

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(certifications)
            .where(and(...conditions))
        : await db.select().from(certifications);

    return c.json(rows);
  })
  /** 資格を1件取得する */
  .get('/:id', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(certifications)
      .where(eq(certifications.id, c.req.param('id')))
      .limit(1);

    if (!row) {
      throw new HTTPException(404, { message: 'Certification not found' });
    }
    return c.json(row);
  })
  /** 資格を作成する（MANAGER 以上）。Department が存在しない場合は 404 */
  .post(
    '/',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = createCertificationSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      const [dept] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, input.departmentId))
        .limit(1);

      if (!dept) {
        throw new HTTPException(404, {
          message: `Department '${input.departmentId}' not found`,
        });
      }

      const [created] = await db
        .insert(certifications)
        .values({
          departmentId: input.departmentId,
          name: input.name,
          shortName: input.shortName,
          organization: input.organization,
          description: input.description ?? null,
        })
        .returning();

      if (!created) {
        throw new HTTPException(500, { message: 'Failed to create certification' });
      }
      return c.json(created, 201);
    },
  )
  /** 資格情報を更新する（MANAGER 以上） */
  .patch(
    '/:id',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = updateCertificationSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      const [existing] = await db
        .select()
        .from(certifications)
        .where(eq(certifications.id, c.req.param('id')))
        .limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'Certification not found' });
      }

      const [updated] = await db
        .update(certifications)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
          ...(input.organization !== undefined ? { organization: input.organization } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .where(eq(certifications.id, c.req.param('id')))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to update certification' });
      }
      return c.json(updated);
    },
  )
  /**
   * 資格を無効化する（isActive=false）（MANAGER 以上）。
   * 物理削除は行わず論理削除とする（instructor_certifications との参照整合性を保持するため）。
   */
  .post('/:id/deactivate', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(certifications)
      .where(eq(certifications.id, c.req.param('id')))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'Certification not found' });
    }

    const [updated] = await db
      .update(certifications)
      .set({ isActive: false })
      .where(eq(certifications.id, c.req.param('id')))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to deactivate certification' });
    }
    return c.json(updated);
  });
