/**
 * Playwright 起動前の準備。webServer は globalSetup より先に起動するため、
 * D1 の作り直しと環境変数ファイルの生成はここで済ませる。
 * 実行内容: E2E 用 D1 の削除 → E2E 用環境変数ファイル生成 → マイグレーション適用 → seed 投入。
 */
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

import { E2E_BASE_URL, E2E_JWT_EXPIRES_IN, E2E_JWT_SECRET, E2E_PERSIST_DIR } from './env.ts';
import { seedE2e } from './seed.ts';

/** `CLOUDFLARE_ENV=e2e` のとき vite-plugin が「だけ」読む環境変数ファイル（gitignore 済み） */
const E2E_VARS_FILE = '.dev.vars.e2e';

/**
 * 値は wrangler.toml の `[vars]` より優先される。
 * SENTRY_DSN は wrangler.toml に無いが、念のため空にして送信を止め、アプリ URL を E2E 用にする。
 */
const e2eVars = [
  `JWT_SECRET=${E2E_JWT_SECRET}`,
  `JWT_EXPIRES_IN=${E2E_JWT_EXPIRES_IN}`,
  'JWT_REFRESH_INTERVAL=15m',
  'JWT_ABSOLUTE_EXPIRES_IN=7d',
  'LINE_CHANNEL_SECRET=e2e-dummy-line-channel-secret',
  `APP_URL=${E2E_BASE_URL}`,
  'SENTRY_DSN=',
  '',
].join('\n');

rmSync(E2E_PERSIST_DIR, { recursive: true, force: true });
writeFileSync(E2E_VARS_FILE, e2eVars);

// 本番に向く `--remote` は指定せず、E2E 専用の永続化先へのローカル適用だけを行う
const migrate = spawnSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    '--config',
    'wrangler.toml',
    'd1',
    'migrations',
    'apply',
    'fuyugyo',
    '--local',
    '--persist-to',
    E2E_PERSIST_DIR,
  ],
  { stdio: 'inherit' },
);
if (migrate.status !== 0) {
  throw new Error(`マイグレーション適用に失敗しました（exit ${migrate.status}）`);
}

await seedE2e();
console.log('E2E の準備が完了しました');
