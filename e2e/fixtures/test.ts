import { test as base } from '@playwright/test';

import { E2E_BASE_URL, E2E_FIXED_NOW } from '../env.ts';

/**
 * ブラウザ時計の固定と外部通信の遮断を行う拡張 test。
 * 固定されるのはブラウザの `Date` のみで、サーバーの `new Date()` は固定されない。
 * サーバー側で日付制約を受ける業務テストは、実行日から決めた将来日へ個別に変更する。
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    // 本番ビルドに公開DSNが埋め込まれていても、Sentryや外部OAuthへ通信しない。
    const origin = new URL(E2E_BASE_URL).origin;
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await provide(context);
    await context.unrouteAll({ behavior: 'wait' });
  },
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(E2E_FIXED_NOW);
    await provide(page);
    // WebKitでは画面遷移時の補助API差し替えが残ることがあるため、完了前にcontextを破棄しない。
    await page.unrouteAll({ behavior: 'wait' });
  },
});

export { expect } from '@playwright/test';
