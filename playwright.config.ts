import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PERSIST_DIR, E2E_PORT } from './e2e/env.ts';

// 本番など外部環境への誤爆を防ぐため、ローカル以外の baseURL は読み込み時点で拒否する
const { hostname } = new URL(E2E_BASE_URL);
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  throw new Error(`E2E の baseURL は localhost のみ許可されます: ${E2E_BASE_URL}`);
}

const isCI = Boolean(process.env.CI);

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
  ],
  webServer: {
    command: 'pnpm run dev',
    port: E2E_PORT,
    // 実行中サーバーが参照する D1 を消す事故を防ぐため、常に新規起動する
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLOUDFLARE_ENV: 'e2e',
      E2E_PORT: String(E2E_PORT),
      E2E_PERSIST_DIR,
      // .env のクライアント側 Sentry DSN を空で上書きして送信を無効にする
      VITE_SENTRY_DSN: '',
    },
  },
});
