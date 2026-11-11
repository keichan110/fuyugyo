import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { weatherPointResponseSchema } from '../src/features/weather/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { users, weatherFetchState, weatherPoints } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

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
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    envWith({}),
  );
}

const pointInput = { name: 'ゲレンデ中腹', latitude: 36.123456, longitude: 137.56789, elevationM: 1500 };

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
