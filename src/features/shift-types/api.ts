import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { type AuthVariables, requireAuth, requireRole } from '@/server/middleware/auth';
import { createDb } from '@/server/db/client';
import { shiftTypes } from '@/server/db/schema';
import type { Env } from '@/server/types';
import { createShiftTypeSchema, updateShiftTypeSchema } from './schema';

/**
 * ShiftType CRUD の Hono ルート（ADR 0005）。
 * レスポンスは生データ + HTTP ステータス（`c.json(data, status)`）。
 * エラーは HTTPException で投げ、中央 `onError` が整形する。
 * 書き込み系（POST/PATCH）は MANAGER 以上を要求する。
 */
export const shiftTypesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** シフト種別一覧を返す（active=false を指定しない限りアクティブのみ返す） */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const activeOnly = c.req.query('active') !== 'false';

    const rows = activeOnly
      ? await db
          .select()
          .from(shiftTypes)
          .where(eq(shiftTypes.isActive, true))
      : await db.select().from(shiftTypes);

    return c.json(rows);
  })
  /** シフト種別を1件取得する */
  .get('/:id', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(shiftTypes)
      .where(eq(shiftTypes.id, c.req.param('id')))
      .limit(1);

    if (!row) {
      throw new HTTPException(404, { message: 'ShiftType not found' });
    }
    return c.json(row);
  })
  /** シフト種別を作成する（MANAGER 以上） */
  .post(
    '/',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = createShiftTypeSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);

      const [created] = await db
        .insert(shiftTypes)
        .values({ name: input.name })
        .returning();

      if (!created) {
        throw new HTTPException(500, { message: 'Failed to create shift type' });
      }
      return c.json(created, 201);
    }
  )
  /** シフト種別名を更新する（MANAGER 以上） */
  .patch(
    '/:id',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = updateShiftTypeSchema.safeParse(value);
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
        .from(shiftTypes)
        .where(eq(shiftTypes.id, c.req.param('id')))
        .limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'ShiftType not found' });
      }

      const [updated] = await db
        .update(shiftTypes)
        .set({ name: input.name })
        .where(eq(shiftTypes.id, c.req.param('id')))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to update shift type' });
      }
      return c.json(updated);
    }
  )
  /**
   * シフト種別を無効化する（isActive=false）（MANAGER 以上）。
   * 物理削除は行わず論理削除とする（Shift テーブルとの参照整合性を保持するため）。
   */
  .post('/:id/deactivate', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(shiftTypes)
      .where(eq(shiftTypes.id, c.req.param('id')))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'ShiftType not found' });
    }

    const [updated] = await db
      .update(shiftTypes)
      .set({ isActive: false })
      .where(eq(shiftTypes.id, c.req.param('id')))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to deactivate shift type' });
    }
    return c.json(updated);
  });
