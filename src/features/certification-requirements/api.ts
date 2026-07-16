import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { departmentCodeSchema } from '@/features/departments/schema';
import { createDb } from '@/server/db/client';
import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
} from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { certificationRequirementUpdateSchema } from './schema';

function validateDepartmentCode(value: string): ReturnType<typeof departmentCodeSchema.parse> {
  const parsed = departmentCodeSchema.safeParse(value);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid department code' });
  }
  return parsed.data;
}

function normalizeLevels<T extends { level: number }>(
  certifications: T[],
): Array<T & { level: number }> {
  const levels = [...new Set(certifications.map((certification) => certification.level))].sort(
    (first, second) => first - second,
  );
  const normalizedLevelByOriginal = new Map(
    levels.map((level, index) => [level, (index + 1) * 10]),
  );

  return certifications.map((certification) => ({
    ...certification,
    level: normalizedLevelByOriginal.get(certification.level) ?? certification.level,
  }));
}

async function findFrame(
  db: ReturnType<typeof createDb>,
  departmentCode: ReturnType<typeof departmentCodeSchema.parse>,
  shiftTypeId: string,
) {
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
    throw new HTTPException(404, { message: 'Department shift type not found' });
  }
  return frame;
}

async function selectCertifications(
  db: ReturnType<typeof createDb>,
  departmentShiftTypeId: string,
) {
  return db
    .select({
      certificationId: certificationRequirements.certificationId,
      level: certificationRequirements.level,
    })
    .from(certificationRequirements)
    .where(eq(certificationRequirements.departmentShiftTypeId, departmentShiftTypeId))
    .orderBy(desc(certificationRequirements.level), asc(certificationRequirements.certificationId));
}

/** 部門別シフト種別ごとの必要資格を取得・全置換する ADMIN 専用ルート。 */
export const certificationRequirementsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  .get('/:departmentCode/:shiftTypeId', requireAuth, requireRole('ADMIN'), async (c) => {
    const departmentCode = validateDepartmentCode(c.req.param('departmentCode'));
    const db = createDb(c.env.DB);
    const frame = await findFrame(db, departmentCode, c.req.param('shiftTypeId'));

    return c.json(await selectCertifications(db, frame.id));
  })
  .put(
    '/:departmentCode/:shiftTypeId',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = certificationRequirementUpdateSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const departmentCode = validateDepartmentCode(c.req.param('departmentCode'));
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const frame = await findFrame(db, departmentCode, c.req.param('shiftTypeId'));
      const normalizedCertifications = normalizeLevels(input.certifications);
      const certificationIds = normalizedCertifications.map(
        (certification) => certification.certificationId,
      );

      if (certificationIds.length > 0) {
        const existing = await db
          .select({ id: certifications.id })
          .from(certifications)
          .where(
            and(
              eq(certifications.departmentCode, departmentCode),
              inArray(certifications.id, certificationIds),
            ),
          );
        if (existing.length !== certificationIds.length) {
          throw new HTTPException(400, {
            message: 'Unknown or foreign department certification ID',
          });
        }
      }

      await db.batch([
        db
          .delete(certificationRequirements)
          .where(eq(certificationRequirements.departmentShiftTypeId, frame.id)),
        ...normalizedCertifications.map((certification) =>
          db.insert(certificationRequirements).values({
            departmentShiftTypeId: frame.id,
            certificationId: certification.certificationId,
            level: certification.level,
          }),
        ),
      ]);

      return c.json(await selectCertifications(db, frame.id));
    },
  );
