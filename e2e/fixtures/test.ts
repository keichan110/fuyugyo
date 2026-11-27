import { test as base, expect } from '@playwright/test';

import { E2E_FIXED_NOW } from '../env.ts';
import { blockExternalRequests } from './network.ts';

/**
 * ブラウザ時計の固定と外部通信の遮断を行う拡張 test。
 * 固定されるのはブラウザの `Date` のみで、サーバーの `new Date()` は固定されない。
 * サーバー側で日付制約を受ける業務テストは、実行日から決めた将来日へ個別に変更する。
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    const sentryAttempts = await blockExternalRequests(context);
    await provide(context);
    // 処理中のハンドラが記録し終えるのを待ってから判定し、判定失敗でも遮断の解除を飛ばさない。
    await context.unrouteAll({ behavior: 'wait' });
    expect(sentryAttempts, 'Sentry への送信が試行された').toEqual([]);
  },
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(E2E_FIXED_NOW);
    await provide(page);
    // WebKitでは画面遷移時の補助API差し替えが残ることがあるため、完了前にcontextを破棄しない。
    await page.unrouteAll({ behavior: 'wait' });
  },
});

export { expect } from '@playwright/test';
