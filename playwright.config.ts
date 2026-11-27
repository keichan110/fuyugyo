import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PERSIST_DIR, E2E_PORT } from './e2e/env.ts';

// 本番など外部環境への誤爆を防ぐため、ローカル以外の baseURL は読み込み時点で拒否する
const { hostname } = new URL(E2E_BASE_URL);
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  throw new Error(`E2E の baseURL は localhost のみ許可されます: ${E2E_BASE_URL}`);
}

const isCI = Boolean(process.env.CI);
const useBuiltWorker = process.env.E2E_BUILT === '1';

export default defineConfig({
  testDir: 'e2e',
  // Vitest の include（test/**/*.{test,spec}.ts）と衝突しない拡張子にする
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  // 共有 D1 を書き換えるテストがあるため直列で実行する
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      // モバイル縦持ち（Chromium のエミュレーション）
      use: { ...devices['Pixel 7'] },
    },
    ...(useBuiltWorker ? [{ name: 'mobile-webkit', use: { ...devices['iPhone 13'] } }] : []),
  ],
  webServer: {
    command: useBuiltWorker ? 'pnpm exec tsx e2e/serve-built.ts' : 'pnpm run dev',
    url: `${E2E_BASE_URL}/api/health`,
    // 実行中サーバーが参照する D1 を消す事故を防ぐため、常に新規起動する
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(useBuiltWorker ? {} : { CLOUDFLARE_ENV: 'e2e' }),
      E2E_PORT: String(E2E_PORT),
      E2E_PERSIST_DIR,
      // dev サーバー（スモーク）のクライアント側 Sentry DSN だけを空で上書きする。
      // ビルド済みバンドル（リリース E2E）は src/lib/sentry.ts のループバック判定と
      // e2e/fixtures/network.ts の外部通信遮断で送信を防ぐ。
      VITE_SENTRY_DSN: '',
    },
  },
});
