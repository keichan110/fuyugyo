/// <reference types="vite/client" />

import type { BrowserOptions, ErrorEvent } from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureRouteError, initializeSentry } from '../src/lib/sentry';

const { init, captureException } = vi.hoisted(() => ({
  init: vi.fn<(options: BrowserOptions) => void>(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/react', () => ({ init, captureException }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Sentry の初期化とルート通知', () => {
  it('DSN 未設定なら初期化しない', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    initializeSentry();
    expect(init).not.toHaveBeenCalled();
  });

  it('release と除外判定を設定し、個人情報の自動収集を無効にする', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');
    vi.stubEnv('VITE_SENTRY_RELEASE', 'commit-sha');
    initializeSentry();
    const options = init.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      dsn: 'https://public@example.com/1',
      release: 'commit-sha',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
    });
    const networkError: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'TypeError', value: 'Failed to fetch' }] },
    };
    expect(options?.beforeSend?.(networkError, {})).toBeNull();
    const appError: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'Error', value: '不具合' }] },
    };
    expect(options?.beforeSend?.(appError, {})).toBe(appError);
  });

  it('Router で捕捉したエラーを Sentry に渡す', () => {
    const error = new Error('描画失敗');
    captureRouteError(error);
    expect(captureException).toHaveBeenCalledWith(error);
  });
});
