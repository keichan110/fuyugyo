import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import { weatherFetchState, weatherPoints } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { updateWeatherPointSchema } from './schema';

/**
 * 天気（予報地点・日別サマリー）の Hono ルート。
 * 予報地点は1件だけ持つマスターデータで、設定の変更は ADMIN に限る。
 * 天気データの取得は Cron（`fetcher.ts`）が行い、ここでは D1 のみを読む。
 */
export const weatherRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** 予報地点を返す（未登録なら null）（ADMIN） */
  .get('/point', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db.select().from(weatherPoints).limit(1);
    return c.json(row ?? null);
  })
  /**
   * 予報地点を登録・更新する（ADMIN）。行は常に1件に保つ。
   * 座標・標高が変わったときは取得状態を消す。古い地点の Last-Modified で
   * If-Modified-Since を送ると 304 が返り、新地点の予報が取得できなくなるため。
   */
  .put(
    '/point',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = updateWeatherPointSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const [existing] = await db.select().from(weatherPoints).limit(1);

      if (!existing) {
        const [created] = await db.insert(weatherPoints).values(input).returning();
        return c.json(created ?? null);
      }

      const locationChanged =
        existing.latitude !== input.latitude ||
        existing.longitude !== input.longitude ||
        existing.elevationM !== input.elevationM;

      const update = db
        .update(weatherPoints)
        .set(input)
        .where(eq(weatherPoints.id, existing.id))
        .returning();
      if (!locationChanged) {
        const [updated] = await update;
        return c.json(updated ?? null);
      }

      const [[updated]] = await db.batch([
        update,
        db.delete(weatherFetchState).where(eq(weatherFetchState.pointId, existing.id)),
      ]);
      return c.json(updated ?? null);
    },
  );
