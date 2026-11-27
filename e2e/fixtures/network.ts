import type { BrowserContext } from '@playwright/test';

import { E2E_BASE_URL } from '../env.ts';

/**
 * 本番ビルドに公開DSNが埋め込まれていても、自社ローカル環境以外へ通信しない。
 * 外部通信はすべて遮断し、Sentry の取り込み先（`*.sentry.io`）への送信試行は URL を記録して返す。
 * @param context 遮断対象のブラウザコンテキスト
 * @returns Sentry への送信試行 URL の配列（空であるべき）
 */
export async function blockExternalRequests(context: BrowserContext): Promise<string[]> {
  const origin = new URL(E2E_BASE_URL).origin;
  const sentryAttempts: string[] = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // 本番 Sentry への誤送信を検知するため、遮断に加えて記録する
    if (url.hostname === 'sentry.io' || url.hostname.endsWith('.sentry.io')) {
      sentryAttempts.push(url.href);
    }
    return route.abort();
  });
  return sentryAttempts;
}
