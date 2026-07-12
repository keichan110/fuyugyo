import { asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { departmentCodeSchema } from '@/features/departments/schema';
import { createDb } from '@/server/db/client';
import { departmentShiftTypes, shiftTypes } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { departmentShiftTypeUpdateSchema } from './schema';

function validateDepartmentCode(value: string): ReturnType<typeof departmentCodeSchema.parse> {
  const parsed = departmentCodeSchema.safeParse(value);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid department code' });
  }
  return parsed.data;
}

function selectDepartmentShiftTypes(
  db: ReturnType<typeof createDb>,
  departmentCode: ReturnType<typeof departmentCodeSchema.parse>,
) {
  return db
    .select({
      shiftTypeId: departmentShiftTypes.shiftTypeId,
      name: shiftTypes.name,
      isActive: shiftTypes.isActive,
      sortOrder: departmentShiftTypes.sortOrder,
    })
    .from(departmentShiftTypes)
    .innerJoin(shiftTypes, eq(departmentShiftTypes.shiftTypeId, shiftTypes.id))
    .where(eq(departmentShiftTypes.departmentCode, departmentCode))
    .orderBy(asc(departmentShiftTypes.sortOrder));
}

/** 部門別シフト種別の取得・一括更新ルート */
export const departmentShiftTypesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  .get('/:departmentCode', requireAuth, async (c) => {
    const departmentCode = validateDepartmentCode(c.req.param('departmentCode'));
    const db = createDb(c.env.DB);
    const rows = await selectDepartmentShiftTypes(db, departmentCode);

    return c.json(rows);
  })
  .put(
    '/:departmentCode',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = departmentShiftTypeUpdateSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const departmentCode = validateDepartmentCode(c.req.param('departmentCode'));
      const { shiftTypeIds } = c.req.valid('json');
      const db = createDb(c.env.DB);

      if (shiftTypeIds.length > 0) {
        const existing = await db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(inArray(shiftTypes.id, shiftTypeIds));
        if (existing.length !== shiftTypeIds.length) {
          throw new HTTPException(400, { message: 'Unknown shift type ID' });
        }
      }

      const removeCurrent = db
        .delete(departmentShiftTypes)
        .where(eq(departmentShiftTypes.departmentCode, departmentCode));
      const additions = shiftTypeIds.map((shiftTypeId, index) =>
        db.insert(departmentShiftTypes).values({
          departmentCode,
          shiftTypeId,
          sortOrder: index + 1,
        }),
      );
      await db.batch([removeCurrent, ...additions]);

      const rows = await selectDepartmentShiftTypes(db, departmentCode);

      return c.json(rows);
    },
  );
