import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jstDateString, jstMidnightToUtc } from '../src/features/weather/daily';
import {
  weatherDailyResponseSchema,
  weatherPointResponseSchema,
} from '../src/features/weather/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  users,
  weatherFetchLogs,
  weatherFetchState,
  weatherPoints,
  weatherSteps,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';
import { runWeatherFetch, WEATHER_USER_AGENT } from '../src/server/weather-fetcher';

/**
 * 天気機能の統合テスト（実 D1）。
 * 予報地点 API・取得処理（fetch はフェイク）・日別サマリー API を検証する。
 */

const SOURCE = 'metno:locationforecast';

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';

/** seed: 指定ロールの User を作成し、JWT を発行して返す */
async function seedToken(role: Role): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: `テスト${role}`,
      role,
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedToken: user insert failed');

  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role,
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

function request(path: string, token: string, init: { method?: string; body?: unknown } = {}) {
  return app.request(
    path,
    {
      method: init.method ?? 'GET',
      headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? null : JSON.stringify(init.body),
    },
    envWith({}),
  );
}

const pointInput = {
  name: 'ゲレンデ中腹',
  latitude: 36.123456,
  longitude: 137.56789,
  elevationM: 1500,
};

beforeEach(async () => {
  // 各テストを独立させるためデータを全削除する（地点の削除で関連テーブルも cascade で消える）
  const db = createDb(env.DB);
  await db.delete(weatherPoints);
  await db.delete(users);
});

describe('GET /api/weather/point', () => {
  it('未認証は 401', async () => {
    const res = await app.request('/api/weather/point', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('ADMIN 未満は 403', async () => {
    for (const role of ['MANAGER', 'MEMBER'] as const) {
      const res = await request('/api/weather/point', await seedToken(role));
      expect(res.status).toBe(403);
    }
  });

  it('未登録なら null', async () => {
    const res = await request('/api/weather/point', await seedToken('ADMIN'));
    expect(res.status).toBe(200);
    expect(weatherPointResponseSchema.parse(await res.json())).toBeNull();
  });
});

describe('PUT /api/weather/point', () => {
  it('ADMIN 未満は 403 で保存されない', async () => {
    const res = await request('/api/weather/point', await seedToken('MANAGER'), {
      method: 'PUT',
      body: pointInput,
    });
    expect(res.status).toBe(403);
    expect(await createDb(env.DB).select().from(weatherPoints)).toHaveLength(0);
  });

  it('不正な入力は 400', async () => {
    const res = await request('/api/weather/point', await seedToken('ADMIN'), {
      method: 'PUT',
      body: { ...pointInput, latitude: 120 },
    });
    expect(res.status).toBe(400);
  });

  it('登録して取得できる。緯度・経度は4桁に切り捨てる', async () => {
    const token = await seedToken('ADMIN');
    const put = await request('/api/weather/point', token, { method: 'PUT', body: pointInput });
    expect(put.status).toBe(200);

    const res = await request('/api/weather/point', token);
    const point = weatherPointResponseSchema.parse(await res.json());
    expect(point).toMatchObject({
      name: 'ゲレンデ中腹',
      latitude: 36.1234,
      longitude: 137.5678,
      elevationM: 1500,
    });
  });

  it('2回目以降は同じ行を更新し、常に1件のまま', async () => {
    const token = await seedToken('ADMIN');
    await request('/api/weather/point', token, { method: 'PUT', body: pointInput });
    await request('/api/weather/point', token, {
      method: 'PUT',
      body: { ...pointInput, name: '山頂' },
    });

    const rows = await createDb(env.DB).select().from(weatherPoints);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('山頂');
  });

  it('座標・標高の変更で取得状態を削除し、名前のみの変更では残す', async () => {
    const token = await seedToken('ADMIN');
    const db = createDb(env.DB);
    await request('/api/weather/point', token, { method: 'PUT', body: pointInput });
    const [point] = await db.select().from(weatherPoints);
    if (!point) throw new Error('point not created');

    const seedState = () =>
      db.insert(weatherFetchState).values({
        pointId: point.id,
        source: SOURCE,
        lastModified: 'Wed, 11 Nov 2026 00:00:00 GMT',
        expiresAt: new Date('2026-11-11T03:00:00Z'),
        lastFetchedAt: new Date('2026-11-11T00:30:00Z'),
      });
    const stateCount = async () =>
      (await db.select().from(weatherFetchState).where(eq(weatherFetchState.pointId, point.id)))
        .length;

    await seedState();
    await request('/api/weather/point', token, {
      method: 'PUT',
      body: { ...pointInput, name: '名前だけ変更' },
    });
    expect(await stateCount()).toBe(1);

    await request('/api/weather/point', token, {
      method: 'PUT',
      body: { ...pointInput, name: '名前だけ変更', elevationM: 1600 },
    });
    expect(await stateCount()).toBe(0);

    await seedState();
    await request('/api/weather/point', token, {
      method: 'PUT',
      body: { ...pointInput, elevationM: 1600, latitude: 36.2 },
    });
    expect(await stateCount()).toBe(0);
  });

  it('同じ座標を再送信しても取得状態は残る（切り捨て後の値で比較する）', async () => {
    const token = await seedToken('ADMIN');
    const db = createDb(env.DB);
    await request('/api/weather/point', token, { method: 'PUT', body: pointInput });
    const [point] = await db.select().from(weatherPoints);
    if (!point) throw new Error('point not created');
    await db.insert(weatherFetchState).values({ pointId: point.id, source: SOURCE });

    await request('/api/weather/point', token, { method: 'PUT', body: pointInput });
    expect(await db.select().from(weatherFetchState)).toHaveLength(1);
  });
});

/** フェイクの fetch。呼び出し内容を calls に記録する */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return respond();
  };
  return { fetchFn, calls };
}

/** compact 形式の最小レスポンス（1時間刻み2点・6時間刻み1点・next_* なしの最終点） */
const forecastBody = {
  properties: {
    timeseries: [
      {
        time: '2026-12-20T00:00:00Z',
        data: {
          instant: {
            details: {
              air_temperature: -5.2,
              wind_speed: 3.4,
              wind_from_direction: 270.4,
              cloud_area_fraction: 80.6,
            },
          },
          next_1_hours: {
            summary: { symbol_code: 'heavysnow' },
            details: { precipitation_amount: 1.5 },
          },
          next_6_hours: {
            summary: { symbol_code: 'cloudy' },
            details: { precipitation_amount: 4 },
          },
        },
      },
      {
        time: '2026-12-20T01:00:00Z',
        data: {
          instant: { details: { air_temperature: -5.5 } },
          next_1_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: {} },
        },
      },
      {
        time: '2026-12-23T00:00:00Z',
        data: {
          instant: { details: { air_temperature: -2 } },
          next_6_hours: {
            summary: { symbol_code: 'lightrain' },
            details: { precipitation_amount: 0.8 },
          },
        },
      },
      { time: '2026-12-29T00:00:00Z', data: { instant: { details: { air_temperature: 0 } } } },
    ],
  },
};

function okResponse(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(forecastBody), {
    status: 200,
    headers: {
      'Last-Modified': 'Wed, 11 Nov 2026 00:00:00 GMT',
      Expires: 'Wed, 11 Nov 2026 03:00:00 GMT',
      ...headers,
    },
  });
}

const NOW = new Date('2026-11-11T01:00:00Z');

async function seedPoint() {
  const db = createDb(env.DB);
  const [point] = await db
    .insert(weatherPoints)
    .values({ name: '中腹', latitude: 36.12349, longitude: 137.5678, elevationM: 1500.9 })
    .returning();
  if (!point) throw new Error('seedPoint failed');
  return point;
}

describe('runWeatherFetch', () => {
  it('地点が未登録なら取得しない', async () => {
    const { fetchFn, calls } = fakeFetch(() => okResponse());
    await runWeatherFetch(createDb(env.DB), { now: NOW, fetchFn });
    expect(calls).toHaveLength(0);
    expect(await createDb(env.DB).select().from(weatherFetchLogs)).toHaveLength(0);
  });

  it('User-Agent と切り捨てた座標・整数の標高を付けて取得する', async () => {
    await seedPoint();
    const { fetchFn, calls } = fakeFetch(() => okResponse());
    await runWeatherFetch(createDb(env.DB), { now: NOW, fetchFn });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe(
      'https://api.met.no/weatherapi/locationforecast/2.0/compact',
    );
    expect(url.searchParams.get('lat')).toBe('36.1234');
    expect(url.searchParams.get('lon')).toBe('137.5678');
    expect(url.searchParams.get('altitude')).toBe('1500');
    expect(calls[0]?.headers.get('User-Agent')).toBe(WEATHER_USER_AGENT);
    expect(calls[0]?.headers.get('If-Modified-Since')).toBeNull();
  });

  it('200 で時間別ステップを保存し、状態とログを記録する', async () => {
    const point = await seedPoint();
    const db = createDb(env.DB);
    const { fetchFn } = fakeFetch(() => okResponse());
    await runWeatherFetch(db, { now: NOW, fetchFn });

    const steps = await db.select().from(weatherSteps).orderBy(weatherSteps.time);
    // next_* のない最終点は捨てる
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({
      pointId: point.id,
      stepHours: 1,
      temperatureC: -5.2,
      precipitationMm: 1.5,
      windSpeedMs: 3.4,
      windDirectionDeg: 270,
      cloudCoverPct: 81,
      condition: 'snow',
      rawSymbol: 'heavysnow',
    });
    expect(steps[1]).toMatchObject({ stepHours: 1, condition: 'clear', precipitationMm: null });
    expect(steps[2]).toMatchObject({ stepHours: 6, condition: 'rain', precipitationMm: 0.8 });

    const [state] = await db.select().from(weatherFetchState);
    expect(state?.lastModified).toBe('Wed, 11 Nov 2026 00:00:00 GMT');
    expect(state?.expiresAt).toEqual(new Date('2026-11-11T03:00:00Z'));
    expect(state?.lastFetchedAt).toEqual(NOW);

    const [log] = await db.select().from(weatherFetchLogs);
    expect(log).toMatchObject({ ok: true, httpStatus: 200, rowsUpserted: 3, error: null });
  });

  it('80行を超える応答でもパラメータ上限に掛からず保存できる', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    const timeseries = Array.from({ length: 100 }, (_, i) => ({
      time: new Date(Date.UTC(2026, 11, 20, i)).toISOString(),
      data: {
        instant: { details: { air_temperature: i } },
        next_1_hours: { summary: { symbol_code: 'cloudy' }, details: { precipitation_amount: 0 } },
      },
    }));
    const { fetchFn } = fakeFetch(
      () => new Response(JSON.stringify({ properties: { timeseries } }), { status: 200 }),
    );
    await runWeatherFetch(db, { now: NOW, fetchFn });

    expect(await db.select().from(weatherSteps)).toHaveLength(100);
    const [log] = await db.select().from(weatherFetchLogs);
    expect(log?.ok).toBe(true);
  });

  it('再取得しても重複せず upsert される', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    const { fetchFn } = fakeFetch(() => okResponse());
    await runWeatherFetch(db, { now: NOW, fetchFn });
    // Expires 経過後に再取得する
    await runWeatherFetch(db, { now: new Date('2026-11-11T03:30:00Z'), fetchFn });

    const steps = await db.select().from(weatherSteps);
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.updatedAt.getTime() === Date.parse('2026-11-11T03:30:00Z'))).toBe(
      true,
    );
  });

  it('Expires 前は取得せずログも残さない', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    await runWeatherFetch(db, { now: NOW, fetchFn: fakeFetch(() => okResponse()).fetchFn });

    const { fetchFn, calls } = fakeFetch(() => okResponse());
    await runWeatherFetch(db, { now: new Date('2026-11-11T02:00:00Z'), fetchFn });
    expect(calls).toHaveLength(0);
    expect(await db.select().from(weatherFetchLogs)).toHaveLength(1);
  });

  it('Expires 後は If-Modified-Since を付け、304 ならステップを変えず状態とログを更新する', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    await runWeatherFetch(db, { now: NOW, fetchFn: fakeFetch(() => okResponse()).fetchFn });

    const later = new Date('2026-11-11T03:30:00Z');
    const { fetchFn, calls } = fakeFetch(
      () =>
        new Response(null, { status: 304, headers: { Expires: 'Wed, 11 Nov 2026 06:00:00 GMT' } }),
    );
    await runWeatherFetch(db, { now: later, fetchFn });

    expect(calls[0]?.headers.get('If-Modified-Since')).toBe('Wed, 11 Nov 2026 00:00:00 GMT');
    const [state] = await db.select().from(weatherFetchState);
    expect(state?.expiresAt).toEqual(new Date('2026-11-11T06:00:00Z'));
    expect(state?.lastFetchedAt).toEqual(later);
    // 304 では Last-Modified を維持する
    expect(state?.lastModified).toBe('Wed, 11 Nov 2026 00:00:00 GMT');
    expect(await db.select().from(weatherSteps)).toHaveLength(3);

    const logs = await db.select().from(weatherFetchLogs).orderBy(weatherFetchLogs.fetchedAt);
    expect(logs[1]).toMatchObject({ ok: true, httpStatus: 304, rowsUpserted: 0 });
  });

  it('500 は ok=false でログに残し、例外を出さない', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    const { fetchFn } = fakeFetch(() => new Response('error', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runWeatherFetch(db, { now: NOW, fetchFn })).resolves.toBeUndefined();

    const [log] = await db.select().from(weatherFetchLogs);
    expect(log).toMatchObject({ ok: false, httpStatus: 500 });
    expect(log?.error).toContain('500');
    expect(await db.select().from(weatherFetchState)).toHaveLength(0);
  });

  it('fetch が例外を投げても ok=false でログに残す', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    const { fetchFn } = fakeFetch(() => {
      throw new Error('network down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runWeatherFetch(db, { now: NOW, fetchFn })).resolves.toBeUndefined();

    const [log] = await db.select().from(weatherFetchLogs);
    expect(log).toMatchObject({ ok: false, httpStatus: null, error: 'network down' });
  });

  it('レスポンスの形式が不正でも ok=false でログに残す', async () => {
    await seedPoint();
    const db = createDb(env.DB);
    const { fetchFn } = fakeFetch(() => new Response('{"unexpected":true}', { status: 200 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWeatherFetch(db, { now: NOW, fetchFn });

    const [log] = await db.select().from(weatherFetchLogs);
    expect(log).toMatchObject({ ok: false, httpStatus: 200 });
    expect(await db.select().from(weatherSteps)).toHaveLength(0);
  });
});

describe('GET /api/weather/daily', () => {
  it('未認証は 401', async () => {
    const res = await app.request('/api/weather/daily', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('地点が未登録なら空を返す（MEMBER でも読める）', async () => {
    const res = await request('/api/weather/daily', await seedToken('MEMBER'));
    expect(res.status).toBe(200);
    expect(weatherDailyResponseSchema.parse(await res.json())).toEqual({
      days: [],
      lastFetchedAt: null,
    });
  });

  it('地点はあるがデータがなければ空を返す', async () => {
    await seedPoint();
    const res = await request('/api/weather/daily', await seedToken('MEMBER'));
    expect(weatherDailyResponseSchema.parse(await res.json())).toEqual({
      days: [],
      lastFetchedAt: null,
    });
  });

  it('JST の今日以降を日付順に集計し、最終取得時刻を返す', async () => {
    const point = await seedPoint();
    const db = createDb(env.DB);
    const today = jstDateString(new Date());
    const todayStart = jstMidnightToUtc(today).getTime();
    const hour = 3600_000;
    const day = 24 * hour;
    const base = {
      pointId: point.id,
      source: SOURCE,
      stepHours: 1,
      precipitationMm: null,
      windSpeedMs: null,
      windDirectionDeg: null,
      cloudCoverPct: null,
      rawSymbol: null,
      updatedAt: new Date(),
    };
    await db.insert(weatherSteps).values([
      // 昨日の行は含めない
      {
        ...base,
        time: new Date(todayStart - day + 10 * hour),
        temperatureC: 20,
        condition: 'clear',
      },
      // 明日 → 今日の順に入れても日付順で返る
      {
        ...base,
        time: new Date(todayStart + day + 10 * hour),
        temperatureC: -1,
        condition: 'rain',
      },
      { ...base, time: new Date(todayStart + 2 * hour), temperatureC: -8, condition: 'clear' },
      { ...base, time: new Date(todayStart + 10 * hour), temperatureC: -3, condition: 'snow' },
    ]);
    await db.insert(weatherFetchLogs).values([
      { pointId: point.id, source: SOURCE, fetchedAt: new Date('2026-11-11T01:00:00Z'), ok: true },
      { pointId: point.id, source: SOURCE, fetchedAt: new Date('2026-11-11T04:00:00Z'), ok: false },
    ]);

    const res = await request('/api/weather/daily', await seedToken('MEMBER'));
    expect(res.status).toBe(200);
    const body = weatherDailyResponseSchema.parse(await res.json());

    expect(body.days.map((d) => d.date)).toEqual([
      today,
      jstDateString(new Date(todayStart + day + 10 * hour)),
    ]);
    expect(body.days[0]).toMatchObject({ morning: 'snow', tempMinC: -8, tempMaxC: -3 });
    expect(body.days[1]).toMatchObject({ morning: 'rain', tempMaxC: -1 });
    // 失敗ログは最終更新時刻に使わない
    expect(body.lastFetchedAt).toEqual(new Date('2026-11-11T01:00:00Z'));
  });
});
