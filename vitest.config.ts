import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
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
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
