import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// 各テストワーカーの実 D1 に Drizzle マイグレーションを適用する
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
