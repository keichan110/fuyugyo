import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  plugins: [
    cloudflareTest(async () => {
      // Drizzle が生成したマイグレーション SQL を読み込み、テスト用 D1 に適用する
      const migrations = await readD1Migrations('./drizzle');
      return {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: {
            // 本番 DSN を設定ファイルから継承せず、テストから通知しない。
            SENTRY_DSN: '',
            TEST_MIGRATIONS: migrations,
            // 認証テスト用の固定シークレット（本番は `wrangler secret` で注入）
            JWT_SECRET: 'test-jwt-secret-at-least-32-bytes-long-000',
            LINE_CHANNEL_SECRET: '0123456789abcdef0123456789abcdef',
            // ローカルの .env にある旧設定に左右されず、セッション仕様を検証する
            JWT_EXPIRES_IN: '2h',
            JWT_REFRESH_INTERVAL: '15m',
            JWT_ABSOLUTE_EXPIRES_IN: '7d',
          },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
    // `--coverage` 指定時のみ有効。Workers プールは V8 カバレッジ非対応のため Istanbul を使う
    coverage: {
      provider: 'istanbul',
      // テストから一度も読み込まれないファイルも 0% として数え、未テストの追加を全体値に反映する
      include: ['src/**/*.{ts,tsx}'],
      // TanStack Router の自動生成ファイルはテスト対象のコードではないため除く
      exclude: ['src/routeTree.gen.ts'],
      reporter: ['text-summary', 'json-summary'],
      // 現状値から数ポイント下げた下限。UI 層は E2E が主体のため個別には縛らず、全体値にのみ含める
      thresholds: {
        statements: 49,
        branches: 36,
        functions: 38,
        lines: 49,
        'src/server/**': { statements: 87, branches: 84, functions: 79, lines: 87 },
        'src/features/*/api.ts': { statements: 93, branches: 83, functions: 98, lines: 93 },
        'src/features/*/schema.ts': { statements: 96, branches: 90, functions: 92, lines: 97 },
      },
    },
  },
});
