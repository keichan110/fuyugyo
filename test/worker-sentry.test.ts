import type { ErrorEvent } from '@sentry/cloudflare';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WEATHER_POINT_ID } from '../src/features/weather/schema';
import app from '../src/index';
import { exchangeCodeForToken, fetchLineUserProfile } from '../src/server/auth/line';
import { createDb } from '../src/server/db/client';
import { weatherFetchLogs, weatherPoints } from '../src/server/db/schema';
import { workerSentryOptions } from '../src/server/sentry';

const { captureException } = vi.hoisted(() => {
  vi.resetModules();
  return { captureException: vi.fn() };
});

vi.mock('@sentry/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/cloudflare')>()),
  captureException,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// 本番の中央ハンドラを通して、通知とレスポンスの契約を同時に検証する。
app.get('/test-sentry/unexpected', () => {
  throw new Error('unexpected');
});
app.get('/test-sentry/503', () => {
  throw new HTTPException(503, { message: 'unavailable' });
});
app.get('/test-sentry/400', () => {
  throw new HTTPException(400, { message: 'bad request' });
});

describe('Worker の通知', () => {
  it('Cron の天気 API 失敗を通知し、D1 に失敗ログを保存する', async () => {
    const db = createDb(env.DB);
    await db.insert(weatherPoints).values({
      id: WEATHER_POINT_ID,
      name: 'テスト地点',
      latitude: 36,
      longitude: 137,
      elevationM: 1500,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const ctx = createExecutionContext();
    await app.scheduled(
      { cron: '23 */3 * * *', scheduledTime: Date.now(), noRetry() {} },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        endpoint: 'https://api.met.no/weatherapi/locationforecast/2.0/compact',
        httpStatus: 503,
      },
    });
    const [log] = await db.select().from(weatherFetchLogs);
    expect(log).toMatchObject({ ok: false, httpStatus: 503 });
  });
  it.each([
    ['unexpected', 500, 'Internal Server Error', 1],
    ['503', 503, 'unavailable', 1],
    ['400', 400, 'bad request', 0],
  ])('%s のレスポンスと通知条件を維持する', async (path, status, message, count) => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request(`https://example.com/test-sentry/${path}`),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
    expect(captureException).toHaveBeenCalledTimes(count);
  });

  it('DSN 未設定では無効にし、設定時はコミット SHA を使う', () => {
    expect(workerSentryOptions({ ...env, SENTRY_DSN: '' }).enabled).toBe(false);
    expect(
      workerSentryOptions({
        ...env,
        SENTRY_DSN: 'https://public@example.com/1',
        SENTRY_RELEASE: 'sha',
      }),
    ).toMatchObject({
      enabled: true,
      release: 'sha',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
    });
  });

  it('送信直前にもリクエスト・ログと個人情報を削除し、内部 ID だけ残す', async () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://example.com/?code=secret',
        headers: { Cookie: 'jwt', Authorization: 'Bearer token' },
        data: 'body',
        cookies: { auth: 'jwt' },
      },
      breadcrumbs: [{ message: 'secret' }],
      user: {
        id: 'internal-id',
        email: 'private@example.com',
        ip_address: '127.0.0.1',
        username: 'LINE name',
      },
    };
    const result = await workerSentryOptions(env).beforeSend?.(event, {});
    expect(result).toEqual({ type: undefined, user: { id: 'internal-id' } });
  });
});

const config = {
  channelId: 'id',
  channelSecret: 'secret',
  callbackUrl: 'https://example.com/callback',
};

describe('LINE API の失敗通知', () => {
  it('通信例外でもログイン失敗へ戻し、握りつぶさず通知する', async () => {
    const requestEnv = { ...env, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
    const start = await app.request('/api/auth/line/login', {}, requestEnv);
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const error = new Error('接続失敗');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(error));
    const response = await app.request(
      `/api/auth/line/callback?${new URLSearchParams({ state, code: 'private-code' })}`,
      { headers: { cookie } },
      requestEnv,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('error=auth_failed');
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
  it.each([
    [400, { error: 'invalid_grant' }, 0],
    [400, { error: 'invalid_client' }, 1],
    [503, { error: 'invalid_grant' }, 1],
    [500, 'not json', 1],
  ])('token の %s を安全に分類する', async (status, body, count) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          typeof body === 'string'
            ? new Response(body, { status })
            : Response.json(body, { status }),
        ),
    );
    expect(await exchangeCodeForToken(config, 'private-code')).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(count);
    if (count)
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: { endpoint: 'https://api.line.me/oauth2/v2.1/token', httpStatus: status },
      });
  });

  it('profile の失敗はステータスを付けて通知し、アクセストークンは渡さない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 502 })),
    );
    expect(await fetchLineUserProfile('private-access-token')).toBeNull();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { endpoint: 'https://api.line.me/v2/profile', httpStatus: 502 },
    });
  });
});
