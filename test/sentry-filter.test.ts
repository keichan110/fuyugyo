import { describe, expect, it } from 'vitest';

import { isIgnoredBrowserError } from '../src/lib/sentry-filter';

/** SDK が生成する例外イベントと同じ形で除外条件を検証する。 */
function event(type: string, value: string, filenames?: string[]) {
  return {
    exception: {
      values: [
        { type, value, stacktrace: { frames: filenames?.map((filename) => ({ filename })) ?? [] } },
      ],
    },
  };
}

describe('ブラウザの通知除外', () => {
  it.each([
    'Failed to fetch',
    'Failed to fetch (127.0.0.1:1)',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
  ])('通信断（%s）を除外する', (message) => {
    expect(isIgnoredBrowserError(event('TypeError', message), undefined)).toBe(true);
  });

  it('キャンセルを除外する', () => {
    expect(isIgnoredBrowserError({}, new DOMException('操作を中止', 'AbortError'))).toBe(true);
    expect(isIgnoredBrowserError(event('AbortError', '操作を中止'), undefined)).toBe(true);
  });

  it.each([400, 401, 403, 404, 429, 499])('HTTP %s を除外する', (status) => {
    expect(isIgnoredBrowserError({}, { status })).toBe(true);
  });

  it('HTTP 500 と通常のプログラム不具合は通知する', () => {
    expect(isIgnoredBrowserError({}, { status: 500 })).toBe(false);
    expect(
      isIgnoredBrowserError(event('TypeError', 'Cannot read properties of undefined'), undefined),
    ).toBe(false);
    expect(isIgnoredBrowserError(event('Error', 'Failed to fetch configuration'), undefined)).toBe(
      false,
    );
    expect(isIgnoredBrowserError({}, undefined)).toBe(false);
  });

  it.each([
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
  ])('無害な警告（%s）を除外する', (message) => {
    expect(isIgnoredBrowserError(event('Error', message), undefined)).toBe(true);
  });

  it('拡張機能だけのスタックは除外し、自アプリのスタックを含む例外は通知する', () => {
    expect(
      isIgnoredBrowserError(
        event('Error', 'extension', ['chrome-extension://id/script.js']),
        undefined,
      ),
    ).toBe(true);
    expect(
      isIgnoredBrowserError(
        event('Error', 'app', [
          'chrome-extension://id/script.js',
          'https://example.com/assets/app.js',
        ]),
        undefined,
      ),
    ).toBe(false);
  });
});
