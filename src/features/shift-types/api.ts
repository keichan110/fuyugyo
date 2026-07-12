import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import { departmentShiftTypes, shiftTypes } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { createShiftTypeSchema, updateShiftTypeSchema } from './schema';

/**
 * ShiftType CRUD の Hono ルート（ADR 0005）。
 * レスポンスは生データ + HTTP ステータス（`c.json(data, status)`）。
 * エラーは HTTPException で投げ、中央 `onError` が整形する。
 * 書き込み系（POST/PATCH）は ADMIN を要求する。
 */
export const shiftTypesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** シフト種別一覧を返す（active=false を指定しない限りアクティブのみ返す） */
  .get('/', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const activeOnly = c.req.query('active') !== 'false';

    const shiftTypeRows = activeOnly
      ? await db.select().from(shiftTypes).where(eq(shiftTypes.isActive, true))
      : await db.select().from(shiftTypes);
    const availabilityRows = await db
      .select({
        shiftTypeId: departmentShiftTypes.shiftTypeId,
        departmentCode: departmentShiftTypes.departmentCode,
      })
      .from(departmentShiftTypes);

    const availableDepartmentCodesByShiftTypeId = new Map<string, string[]>();
    for (const { shiftTypeId, departmentCode } of availabilityRows) {
      const codes = availableDepartmentCodesByShiftTypeId.get(shiftTypeId) ?? [];
      codes.push(departmentCode);
      availableDepartmentCodesByShiftTypeId.set(shiftTypeId, codes);
    }

    return c.json(
      shiftTypeRows.map((shiftType) => ({
        ...shiftType,
        availableDepartmentCodes: availableDepartmentCodesByShiftTypeId.get(shiftType.id) ?? [],
      })),
    );
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
  /** シフト種別を作成する（ADMIN） */
  .post(
    '/',
    requireAuth,
    requireRole('ADMIN'),
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

      const [created] = await db.insert(shiftTypes).values({ name: input.name }).returning();

      if (!created) {
        throw new HTTPException(500, { message: 'Failed to create shift type' });
      }
      return c.json(created, 201);
    },
  )
  /** シフト種別名または有効状態を更新する（ADMIN） */
  .patch(
    '/:id',
    requireAuth,
    requireRole('ADMIN'),
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

      const changes = {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      };
      const [updated] = await db
        .update(shiftTypes)
        .set(changes)
        .where(eq(shiftTypes.id, c.req.param('id')))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to update shift type' });
      }
      return c.json(updated);
    },
  );
