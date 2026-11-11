import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';

import { createDb } from '@/server/db/client';
import {
  weatherFetchLogs,
  weatherFetchState,
  weatherPoints,
  weatherSteps,
} from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { jstDateString, jstMidnightToUtc, summarizeDay, type StepRow } from './daily';
import { updateWeatherPointSchema, WEATHER_SOURCE, weatherStepsQuerySchema } from './schema';

/**
 * 天気（予報地点・日別サマリー）の Hono ルート。
 * 予報地点は1件だけ持つマスターデータで、設定の変更は ADMIN に限る。
 * 天気データの取得は Cron（`@/server/weather-fetcher`）が行い、ここでは D1 のみを読む。
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
  )
  /**
   * JST の今日以降の日別サマリーを返す（ログイン済みなら全ロール）。
   * 時間別ステップから表示時に集計する。地点未登録・データなしなら空配列。
   */
  .get('/daily', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const [point] = await db.select().from(weatherPoints).limit(1);
    if (!point) return c.json({ days: [], lastFetchedAt: null });

    const todayStart = jstMidnightToUtc(jstDateString(new Date()));
    const rows = await db
      .select()
      .from(weatherSteps)
      .where(
        and(
          eq(weatherSteps.pointId, point.id),
          eq(weatherSteps.source, WEATHER_SOURCE),
          gte(weatherSteps.time, todayStart),
        ),
      )
      .orderBy(weatherSteps.time);

    // JST の日付ごとにまとめ、データのある日だけを集計する（rows は時刻順なので日付順になる）
    const stepsByDate = new Map<string, StepRow[]>();
    for (const row of rows) {
      const date = jstDateString(row.time);
      const steps = stepsByDate.get(date) ?? [];
      steps.push(row);
      stepsByDate.set(date, steps);
    }
    const days = [...stepsByDate.entries()].map(([date, steps]) => summarizeDay(date, steps));

    if (days.length === 0) return c.json({ days: [], lastFetchedAt: null });

    // 最終取得時刻の2クエリは互いに独立なので並列に実行する
    const [[lastOk], [state]] = await Promise.all([
      db
        .select({ fetchedAt: weatherFetchLogs.fetchedAt })
        .from(weatherFetchLogs)
        .where(
          and(
            eq(weatherFetchLogs.pointId, point.id),
            eq(weatherFetchLogs.source, WEATHER_SOURCE),
            eq(weatherFetchLogs.ok, true),
          ),
        )
        .orderBy(desc(weatherFetchLogs.fetchedAt))
        .limit(1),
      db
        .select({ lastFetchedAt: weatherFetchState.lastFetchedAt })
        .from(weatherFetchState)
        .where(
          and(
            eq(weatherFetchState.pointId, point.id),
            eq(weatherFetchState.source, WEATHER_SOURCE),
          ),
        )
        .limit(1),
    ]);

    return c.json({ days, lastFetchedAt: lastOk?.fetchedAt ?? state?.lastFetchedAt ?? null });
  })
  /**
   * 指定日（JST 0:00〜24:00）に開始するステップを時刻順に返す（ログイン済みなら全ロール）。
   * 日別行の展開表示用。地点未登録なら空配列。
   */
  .get(
    '/steps',
    requireAuth,
    validator('query', (value, c) => {
      const parsed = weatherStepsQuerySchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const { date } = c.req.valid('query');
      const db = createDb(c.env.DB);
      const [point] = await db.select().from(weatherPoints).limit(1);
      if (!point) return c.json({ steps: [] });

      const from = jstMidnightToUtc(date);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          time: weatherSteps.time,
          stepHours: weatherSteps.stepHours,
          condition: weatherSteps.condition,
          temperatureC: weatherSteps.temperatureC,
          precipitationMm: weatherSteps.precipitationMm,
          windSpeedMs: weatherSteps.windSpeedMs,
        })
        .from(weatherSteps)
        .where(
          and(
            eq(weatherSteps.pointId, point.id),
            eq(weatherSteps.source, WEATHER_SOURCE),
            gte(weatherSteps.time, from),
            lt(weatherSteps.time, to),
          ),
        )
        .orderBy(weatherSteps.time);
      return c.json({ steps: rows });
    },
  );
