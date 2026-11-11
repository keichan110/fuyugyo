import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { normalizeSymbol } from '@/features/weather/daily';
import { truncateCoordinate } from '@/features/weather/schema';

import type { Database } from './db/client';
import {
  weatherFetchLogs,
  weatherFetchState,
  weatherPoints,
  weatherSteps,
} from './db/schema';

/** 天気データ源の識別子。API を乗り換え・併用するときは別の値で区別する */
export const WEATHER_SOURCE = 'metno:locationforecast';

/** MET Norway の利用規約で求められる User-Agent（アプリ名と連絡先） */
export const WEATHER_USER_AGENT = 'fuyugyo/1.0 github.com/keichan110/fuyugyo';

const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * 1文あたりの INSERT 行数。D1 は1文に束縛できるパラメータ数が約100件に制限されるため、
 * 1行12列 × 8行 = 96 に収める。
 */
const ROWS_PER_STATEMENT = 8;

const nextPeriodSchema = z.object({
  summary: z.object({ symbol_code: z.string().optional() }).optional(),
  details: z.object({ precipitation_amount: z.number().optional() }).optional(),
});

/** compact 形式のレスポンス。使う項目以外は無視し、欠けていても落ちないようにする */
const forecastResponseSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({
          instant: z
            .object({
              details: z
                .object({
                  air_temperature: z.number().optional(),
                  wind_speed: z.number().optional(),
                  wind_from_direction: z.number().optional(),
                  cloud_area_fraction: z.number().optional(),
                })
                .optional(),
            })
            .optional(),
          next_1_hours: nextPeriodSchema.optional(),
          next_6_hours: nextPeriodSchema.optional(),
        }),
      }),
    ),
  }),
});

type StepInsert = typeof weatherSteps.$inferInsert;

/**
 * compact レスポンスを時間別ステップ行に変換する。
 * next_1_hours があれば1時間刻み、なければ next_6_hours で6時間刻み。
 * どちらもない最終要素などは捨てる。
 */
function toStepRows(
  body: z.infer<typeof forecastResponseSchema>,
  pointId: string,
  now: Date,
): StepInsert[] {
  const rows: StepInsert[] = [];
  for (const entry of body.properties.timeseries) {
    const time = new Date(entry.time);
    if (Number.isNaN(time.getTime())) continue;

    const { next_1_hours: next1, next_6_hours: next6 } = entry.data;
    const stepHours = next1 ? 1 : next6 ? 6 : null;
    const period = next1 ?? next6;
    if (stepHours === null || !period) continue;

    const details = entry.data.instant?.details;
    const rawSymbol = period.summary?.symbol_code ?? null;
    rows.push({
      pointId,
      source: WEATHER_SOURCE,
      time,
      stepHours,
      temperatureC: details?.air_temperature ?? null,
      precipitationMm: period.details?.precipitation_amount ?? null,
      windSpeedMs: details?.wind_speed ?? null,
      windDirectionDeg:
        details?.wind_from_direction === undefined ? null : Math.round(details.wind_from_direction),
      cloudCoverPct:
        details?.cloud_area_fraction === undefined ? null : Math.round(details.cloud_area_fraction),
      condition: normalizeSymbol(rawSymbol),
      rawSymbol,
      updatedAt: now,
    });
  }
  return rows;
}

/** 時間別ステップを (地点, データ源, 開始時刻) で upsert し、反映した行数を返す */
async function upsertSteps(db: Database, rows: StepInsert[]): Promise<number> {
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    statements.push(
      db
        .insert(weatherSteps)
        .values(rows.slice(i, i + ROWS_PER_STATEMENT))
        .onConflictDoUpdate({
          target: [weatherSteps.pointId, weatherSteps.source, weatherSteps.time],
          set: {
            stepHours: sql`excluded.step_hours`,
            temperatureC: sql`excluded.temperature_c`,
            precipitationMm: sql`excluded.precipitation_mm`,
            windSpeedMs: sql`excluded.wind_speed_ms`,
            windDirectionDeg: sql`excluded.wind_direction_deg`,
            cloudCoverPct: sql`excluded.cloud_cover_pct`,
            condition: sql`excluded.condition`,
            rawSymbol: sql`excluded.raw_symbol`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
  }
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
  return rows.length;
}

/** Expires ヘッダを Date にする。無い・解釈できない場合は null */
function parseExpires(header: string | null): Date | null {
  if (!header) return null;
  const ms = Date.parse(header);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** 取得状態を保存する（Last-Modified は 304 で返らないことがあるため、あれば上書き・なければ維持） */
async function saveState(
  db: Database,
  pointId: string,
  values: { lastModified: string | null; expiresAt: Date | null; now: Date },
): Promise<void> {
  const set = {
    expiresAt: values.expiresAt,
    lastFetchedAt: values.now,
    ...(values.lastModified === null ? {} : { lastModified: values.lastModified }),
  };
  await db
    .insert(weatherFetchState)
    .values({ pointId, source: WEATHER_SOURCE, lastModified: values.lastModified, ...set })
    .onConflictDoUpdate({
      target: [weatherFetchState.pointId, weatherFetchState.source],
      set,
    });
}

async function writeLog(
  db: Database,
  log: {
    pointId: string;
    now: Date;
    ok: boolean;
    httpStatus: number | null;
    rowsUpserted: number | null;
    error: string | null;
  },
): Promise<void> {
  await db.insert(weatherFetchLogs).values({
    pointId: log.pointId,
    source: WEATHER_SOURCE,
    fetchedAt: log.now,
    ok: log.ok,
    httpStatus: log.httpStatus,
    rowsUpserted: log.rowsUpserted,
    error: log.error,
  });
}

/**
 * 登録済みの予報地点の天気を MET Norway から取得して D1 に保存する（Cron から呼ぶ）。
 * 規約に従い、`Expires` までは再取得せず、`If-Modified-Since` を付けて取得する。
 * 失敗はログに残すだけで例外は外へ出さない（Cron を落とさないため）。
 *
 * @param db - Drizzle クライアント
 * @param options.now - 現在時刻
 * @param options.fetchFn - HTTP 取得関数（テストで差し替える）
 */
export async function runWeatherFetch(
  db: Database,
  options: { now: Date; fetchFn: typeof fetch },
): Promise<void> {
  const { now, fetchFn } = options;
  let pointId: string | null = null;
  let httpStatus: number | null = null;
  try {
    const [point] = await db.select().from(weatherPoints).limit(1);
    if (!point) return;
    pointId = point.id;

    const [state] = await db
      .select()
      .from(weatherFetchState)
      .where(
        and(eq(weatherFetchState.pointId, point.id), eq(weatherFetchState.source, WEATHER_SOURCE)),
      )
      .limit(1);
    // Expires 前の再リクエストは規約で禁じられているため、ログも残さず何もしない
    if (state?.expiresAt && state.expiresAt.getTime() > now.getTime()) return;

    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', String(truncateCoordinate(point.latitude)));
    url.searchParams.set('lon', String(truncateCoordinate(point.longitude)));
    url.searchParams.set('altitude', String(Math.trunc(point.elevationM)));

    const headers: Record<string, string> = { 'User-Agent': WEATHER_USER_AGENT };
    if (state?.lastModified) headers['If-Modified-Since'] = state.lastModified;

    const res = await fetchFn(url.toString(), { headers });
    httpStatus = res.status;
    const expiresAt = parseExpires(res.headers.get('Expires'));

    if (res.status === 304) {
      await saveState(db, point.id, { lastModified: null, expiresAt, now });
      await writeLog(db, {
        pointId: point.id,
        now,
        ok: true,
        httpStatus: 304,
        rowsUpserted: 0,
        error: null,
      });
      return;
    }
    if (res.status !== 200) {
      throw new Error(`Unexpected HTTP status: ${res.status}`);
    }

    const body = forecastResponseSchema.parse(await res.json());
    const rowsUpserted = await upsertSteps(db, toStepRows(body, point.id, now));
    await saveState(db, point.id, {
      lastModified: res.headers.get('Last-Modified'),
      expiresAt,
      now,
    });
    await writeLog(db, {
      pointId: point.id,
      now,
      ok: true,
      httpStatus: 200,
      rowsUpserted,
      error: null,
    });
  } catch (error) {
    console.error('[weather] fetch failed:', error);
    if (pointId === null) return;
    try {
      await writeLog(db, {
        pointId,
        now,
        ok: false,
        httpStatus,
        rowsUpserted: null,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error('[weather] failed to write fetch log:', logError);
    }
  }
}
