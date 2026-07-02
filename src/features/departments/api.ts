import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import { departments } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { createDepartmentSchema, updateDepartmentSchema } from './schema';

/** SQLite UNIQUE 制約違反かどうかを判定する。Drizzle が DrizzleQueryError でラップするため cause も確認する */
function isUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.message.includes('UNIQUE constraint failed')) return true;
  if (e.cause instanceof Error && e.cause.message.includes('UNIQUE constraint failed')) return true;
  return false;
}

/**
 * Department CRUD の Hono ルート（ADR 0005）。
 * レスポンスは生データ + HTTP ステータス（`c.json(data, status)`）。
 * エラーは HTTPException で投げ、中央 `onError` が整形する。
 * 書き込み系（POST/PATCH）は MANAGER 以上を要求する。
 */
export const departmentsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** 部門一覧を返す（active=false を指定しない限りアクティブのみ返す） */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const activeOnly = c.req.query('active') !== 'false';

    const rows = activeOnly
      ? await db.select().from(departments).where(eq(departments.isActive, true))
      : await db.select().from(departments);

    return c.json(rows);
  })
  /** 部門を1件取得する */
  .get('/:id', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, c.req.param('id')))
      .limit(1);

    if (!row) {
      throw new HTTPException(404, { message: 'Department not found' });
    }
    return c.json(row);
  })
  /** 部門を作成する（MANAGER 以上） */
  .post(
    '/',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = createDepartmentSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      try {
        const [created] = await db
          .insert(departments)
          .values({
            code: input.code,
            name: input.name,
            description: input.description ?? null,
          })
          .returning();

        if (!created) {
          throw new HTTPException(500, { message: 'Failed to create department' });
        }
        return c.json(created, 201);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, {
            message: `Department code '${input.code}' already exists`,
          });
        }
        throw err;
      }
    },
  )
  /** 部門情報を更新する（MANAGER 以上） */
  .patch(
    '/:id',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = updateDepartmentSchema.safeParse(value);
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
        .from(departments)
        .where(eq(departments.id, c.req.param('id')))
        .limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'Department not found' });
      }

      const [updated] = await db
        .update(departments)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .where(eq(departments.id, c.req.param('id')))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to update department' });
      }
      return c.json(updated);
    },
  )
  /**
   * 部門を無効化する（isActive=false）（MANAGER 以上）。
   * 物理削除は行わず論理削除とする（他テーブルとの参照整合性を保持するため）。
   */
  .post('/:id/deactivate', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, c.req.param('id')))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'Department not found' });
    }

    const [updated] = await db
      .update(departments)
      .set({ isActive: false })
      .where(eq(departments.id, c.req.param('id')))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to deactivate department' });
    }
    return c.json(updated);
  });
