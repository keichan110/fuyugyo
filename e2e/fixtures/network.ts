import type { BrowserContext } from '@playwright/test';

import { E2E_BASE_URL } from '../env.ts';

/** 本番ビルドに公開DSNが埋め込まれていても、自社ローカル環境以外へ通信しない。 */
export async function blockExternalRequests(context: BrowserContext): Promise<void> {
  const origin = new URL(E2E_BASE_URL).origin;
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
}
