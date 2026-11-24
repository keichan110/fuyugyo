import { env } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_REQUEST_LIMIT } from '../src/features/access-requests/constants';
import { accessRequestResponseSchema } from '../src/features/access-requests/schema';
import app from '../src/index';
import {
  signAccessRequestToken,
  verifyAccessRequestToken,
} from '../src/server/auth/access-request-token';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { accessRequests, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * 利用申請 API の統合テスト（実 D1）。
 * 申請トークンの相互不受理・上限・期限・再申請・受付停止・Rate Limit を検証する。
 */

const DAY = 24 * 60 * 60 * 1000;
const LINE_USER = 'line-requester';

/** テスト中に件数を数える擬似 Rate Limiter。CF ネイティブ binding は決定論的に動かせないため注入する */
function makeRateLimiter(limit: number) {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }: { key: string }) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { success: next <= limit };
    },
  };
}

/** 申請を受け付ける設定の env。上書きで受付停止や Rate Limit を再現する */
function envWith(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    ACCESS_REQUESTS_ENABLED: 'true',
    AUTH_RATE_LIMITER: makeRateLimiter(50),
    ...overrides,
  };
}

/** ACCESS_REQUESTS_ENABLED を設定していない env（未設定は受付停止として扱う） */
function withoutEnabledFlag(): Env {
  const reqEnv = envWith();
  Reflect.deleteProperty(reqEnv, 'ACCESS_REQUESTS_ENABLED');
  return reqEnv;
}

/** 申請 Cookie を載せた POST リクエストを作る（同一オリジンからの正規リクエストを模す） */
function postRequest(token?: string, cf?: Record<string, unknown>): Request {
  return new Request('http://localhost/api/access-requests', {
    method: 'POST',
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(token === undefined ? {} : { cookie: `access-request=${token}` }),
    },
    ...(cf ? { cf } : {}),
  });
}

/** 申請トークンを発行する */
function requestToken(userId = LINE_USER, extra: { pictureUrl?: string } = {}) {
  return signAccessRequestToken({ userId, displayName: '申請者', ...extra }, env.JWT_SECRET);
}

/** 他人の申請を n 件 seed する */
async function seedRequests(n: number, requestedAt = new Date()) {
  const db = createDb(env.DB);
  for (let i = 0; i < n; i++) {
    await db.insert(accessRequests).values({
      id: crypto.randomUUID(),
      lineUserId: `other-${crypto.randomUUID()}`,
      displayName: `他人${i}`,
      requestedAt,
    });
  }
}

async function allRequests() {
  return await createDb(env.DB).select().from(accessRequests);
}

async function requestsOf(lineUserId: string) {
  return await createDb(env.DB)
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.lineUserId, lineUserId));
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(accessRequests);
  await db.delete(users);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/access-requests', () => {
  it('有効な申請 Cookie で申請が1行でき、201 と申請 Cookie の削除を返す', async () => {
    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(201);
    const body = accessRequestResponseSchema.parse(await res.json());
    const rows = await allRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lineUserId: LINE_USER,
      displayName: '申請者',
      pictureUrl: null,
    });
    expect(rows[0]?.requestedAt.toISOString()).toBe(
      new Date(Math.floor(Date.parse(body.requestedAt) / 1000) * 1000).toISOString(),
    );
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('access-request=');
    expect(cookie.toLowerCase()).toContain('max-age=0');
    expect(cookie).toContain('Path=/api/access-requests');
  });

  it('位置を取得できない環境では country/region/city が null のまま成功する', async () => {
    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(201);
    expect((await requestsOf(LINE_USER))[0]).toMatchObject({
      country: null,
      region: null,
      city: null,
    });
  });

  it('request.cf の国・地域・市区町村を保存し、文字列以外は null にする', async () => {
    const res = await app.request(
      postRequest(await requestToken(), { country: 'JP', region: 'Hokkaido', city: 123 }),
      {},
      envWith(),
    );

    expect(res.status).toBe(201);
    expect((await requestsOf(LINE_USER))[0]).toMatchObject({
      country: 'JP',
      region: 'Hokkaido',
      city: null,
    });
  });

  it('プロフィール画像の URL を保存する', async () => {
    const pictureUrl = 'https://profile.line-scdn.net/example';
    await app.request(postRequest(await requestToken(LINE_USER, { pictureUrl })), {}, envWith());

    expect((await requestsOf(LINE_USER))[0]?.pictureUrl).toBe(pictureUrl);
  });

  it('同じ LINE アカウントの再申請は行を増やさず、日時・表示名・位置を更新する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
    await app.request(
      postRequest(await requestToken(), { country: 'JP', region: 'Hokkaido', city: 'Sapporo' }),
      {},
      envWith(),
    );
    const [first] = await requestsOf(LINE_USER);

    vi.setSystemTime(new Date('2026-01-12T00:00:00.000Z'));
    const token = await signAccessRequestToken(
      { userId: LINE_USER, displayName: '改名後' },
      env.JWT_SECRET,
    );
    const res = await app.request(
      postRequest(token, { country: 'JP', region: 'Nagano', city: 'Hakuba' }),
      {},
      envWith(),
    );

    expect(res.status).toBe(201);
    const rows = await requestsOf(LINE_USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first?.id,
      displayName: '改名後',
      pictureUrl: null,
      region: 'Nagano',
      city: 'Hakuba',
    });
    expect(rows[0]?.requestedAt.toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it(`他人の未承認が${ACCESS_REQUEST_LIMIT}件ある状態の新規申請は403で、行を作らない`, async () => {
    await seedRequests(ACCESS_REQUEST_LIMIT);

    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(403);
    expect(await requestsOf(LINE_USER)).toHaveLength(0);
    expect(await allRequests()).toHaveLength(ACCESS_REQUEST_LIMIT);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it(`他人が${ACCESS_REQUEST_LIMIT - 1}件なら新規申請は通り、上限ちょうどになる`, async () => {
    await seedRequests(ACCESS_REQUEST_LIMIT - 1);

    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(201);
    expect(await allRequests()).toHaveLength(ACCESS_REQUEST_LIMIT);
  });

  it('自分の申請が既にあれば、上限に達していても再申請は通る', async () => {
    await seedRequests(ACCESS_REQUEST_LIMIT);
    await createDb(env.DB)
      .insert(accessRequests)
      .values({
        id: crypto.randomUUID(),
        lineUserId: LINE_USER,
        displayName: '旧表示名',
        requestedAt: new Date(Date.now() - DAY),
      });

    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(201);
    expect(await allRequests()).toHaveLength(ACCESS_REQUEST_LIMIT + 1);
    expect((await requestsOf(LINE_USER))[0]?.displayName).toBe('申請者');
  });

  it('7日を過ぎた申請は POST 時に削除され、件数に含まれない', async () => {
    await seedRequests(ACCESS_REQUEST_LIMIT, new Date(Date.now() - 7 * DAY - 60_000));

    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(201);
    const rows = await allRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lineUserId).toBe(LINE_USER);
  });

  it('7日以内の申請は削除しない', async () => {
    await seedRequests(3, new Date(Date.now() - 7 * DAY + 60_000));

    await app.request(postRequest(await requestToken()), {}, envWith());

    expect(await allRequests()).toHaveLength(4);
  });

  it.each([undefined, 'false', 'TRUE', ''])(
    'ACCESS_REQUESTS_ENABLED が %s のときは403で行を作らない',
    async (value) => {
      const res = await app.request(
        postRequest(await requestToken()),
        {},
        value === undefined ? withoutEnabledFlag() : envWith({ ACCESS_REQUESTS_ENABLED: value }),
      );

      expect(res.status).toBe(403);
      expect(await allRequests()).toHaveLength(0);
    },
  );

  describe('申請 Cookie の検証', () => {
    /** 検証条件のうち 1 つだけを崩した申請トークンを作る */
    async function craft(
      options: { secret?: string; audience?: string; issuer?: string; expiresAt?: number } = {},
    ) {
      const now = Math.floor(Date.now() / 1000);
      return await new SignJWT({ userId: LINE_USER, displayName: '申請者' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(options.issuer ?? 'fuyugyo')
        .setAudience(options.audience ?? 'fuyugyo-access-request')
        .setIssuedAt(now)
        .setExpirationTime(options.expiresAt ?? now + 600)
        .sign(new TextEncoder().encode(options.secret ?? env.JWT_SECRET));
    }

    it('対照: 条件を満たす手作りトークンは受け付ける', async () => {
      const res = await app.request(postRequest(await craft()), {}, envWith());
      expect(res.status).toBe(201);
    });

    const cases: Array<[string, () => Promise<string | undefined>]> = [
      ['Cookie がない', async () => undefined],
      ['空の Cookie', async () => ''],
      ['JWT でない文字列', async () => 'not-a-jwt'],
      ['署名鍵が異なる', () => craft({ secret: 'another-secret-that-is-long-enough-0000' })],
      ['audience が異なる', () => craft({ audience: 'fuyugyo-users' })],
      ['issuer が異なる', () => craft({ issuer: 'other' })],
      ['期限切れ', () => craft({ expiresAt: Math.floor(Date.now() / 1000) - 10 })],
      [
        '改ざんされた',
        async () => {
          const [header, , signature] = (await craft()).split('.');
          const forged = btoa(JSON.stringify({ userId: 'forged', displayName: 'x' }))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
          return `${header}.${forged}.${signature}`;
        },
      ],
    ];

    it.each(cases)('%sリクエストは401で行を作らない', async (_name, build) => {
      const res = await app.request(postRequest(await build()), {}, envWith());

      expect(res.status).toBe(401);
      expect(await allRequests()).toHaveLength(0);
    });

    it('セッション JWT を申請 Cookie に入れても401になる', async () => {
      const session = await signJwt(
        { userId: 'u1', displayName: '会員', role: 'MEMBER', isActive: true },
        env.JWT_SECRET,
        '2h',
      );

      const res = await app.request(postRequest(session), {}, envWith());

      expect(res.status).toBe(401);
    });

    it('申請トークンを auth-token に入れても保護 API は401になる', async () => {
      const token = await requestToken();

      for (const init of [
        { headers: { cookie: `auth-token=${token}` } },
        { headers: { authorization: `Bearer ${token}` } },
      ]) {
        const res = await app.request('/api/auth/me', init, envWith());
        expect(res.status).toBe(401);
      }
    });

    it('申請トークンは専用 audience で検証でき、別の鍵では検証できない', async () => {
      const token = await requestToken(LINE_USER, { pictureUrl: 'https://example.com/p.png' });

      expect(await verifyAccessRequestToken(token, env.JWT_SECRET)).toEqual({
        userId: LINE_USER,
        displayName: '申請者',
        pictureUrl: 'https://example.com/p.png',
      });
      expect(
        await verifyAccessRequestToken(token, 'another-secret-that-is-long-enough'),
      ).toBeNull();
    });

    it('ペイロードが不正な（userId がない）トークンは401になる', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ displayName: '申請者' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('fuyugyo')
        .setAudience('fuyugyo-access-request')
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(new TextEncoder().encode(env.JWT_SECRET));

      const res = await app.request(postRequest(token), {}, envWith());

      expect(res.status).toBe(401);
    });
  });

  it('登録済みの User からの申請は409で行を作らない', async () => {
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: LINE_USER, displayName: '登録済み', role: 'MEMBER', isActive: true });

    const res = await app.request(postRequest(await requestToken()), {}, envWith());

    expect(res.status).toBe(409);
    const [row] = await createDb(env.DB).select({ value: count() }).from(accessRequests);
    expect(row?.value).toBe(0);
  });

  it('Rate Limit を超えると429を返し、行を作らない', async () => {
    const reqEnv = envWith({ AUTH_RATE_LIMITER: makeRateLimiter(1) });
    const token = await requestToken();

    const first = await app.request(postRequest(token), {}, reqEnv);
    const second = await app.request(postRequest(token), {}, reqEnv);

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(await allRequests()).toHaveLength(1);
  });
});
