import { test as base } from '@playwright/test';

import { E2E_FIXED_NOW } from '../env.ts';

/**
 * ブラウザ時計を固定した拡張 test。
 * 固定されるのはブラウザの `Date` のみで、サーバーの `new Date()` は固定されない。
 * そのためサーバー時刻に依存する表示は検証対象にしない。
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(E2E_FIXED_NOW);
    await provide(page);
  },
});

export { expect } from '@playwright/test';
