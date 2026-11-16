/**
 * production buildをViteのpreviewで配信する。
 * 開発用の再読み込みプロキシを介さず、成果物は変更せずに実行時設定だけを隔離する。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import { preview } from 'vite';
import { z } from 'zod';

import {
  E2E_BASE_URL,
  E2E_JWT_EXPIRES_IN,
  E2E_JWT_SECRET,
  E2E_PERSIST_DIR,
  E2E_PORT,
} from './env.ts';

const builtConfigPath = resolve('dist/fuyugyo/wrangler.json');
const builtConfig = z
  .looseObject({
    main: z.string(),
    assets: z.looseObject({ directory: z.string() }),
    vars: z.record(z.string(), z.unknown()),
  })
  .parse(JSON.parse(readFileSync(builtConfigPath, 'utf8')));

const previewRoot = resolve('.wrangler/e2e-preview');
const previewConfigPath = resolve(previewRoot, 'wrangler.json');
const deployDirectory = resolve(previewRoot, '.wrangler/deploy');
mkdirSync(deployDirectory, { recursive: true });
writeFileSync(
  previewConfigPath,
  JSON.stringify({
    ...builtConfig,
    // 設定の移動で相対パスの基準が変わるため、元の成果物を指す絶対パスにする。
    main: resolve(dirname(builtConfigPath), builtConfig.main),
    assets: {
      ...builtConfig.assets,
      directory: resolve(dirname(builtConfigPath), builtConfig.assets.directory),
    },
    vars: {
      ...builtConfig.vars,
      JWT_SECRET: E2E_JWT_SECRET,
      JWT_EXPIRES_IN: E2E_JWT_EXPIRES_IN,
      JWT_REFRESH_INTERVAL: '15m',
      JWT_ABSOLUTE_EXPIRES_IN: '7d',
      LINE_CHANNEL_SECRET: 'e2e-dummy-line-channel-secret',
      APP_URL: E2E_BASE_URL,
      SENTRY_DSN: '',
    },
  }),
);
// previewが参照する生成設定を専用ディレクトリに置き、本番のデプロイ設定を保持する。
writeFileSync(
  resolve(deployDirectory, 'config.json'),
  JSON.stringify({
    configPath: previewConfigPath,
    auxiliaryWorkers: [],
  }),
);

const server = await preview({
  root: previewRoot,
  configFile: false,
  plugins: [
    cloudflare({
      persistState: { path: resolve(E2E_PERSIST_DIR) },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  preview: { host: '127.0.0.1', port: E2E_PORT, strictPort: true },
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    let exitCode = 0;
    try {
      await server.close();
    } catch (error) {
      console.error('E2E previewの終了処理に失敗しました', error);
      exitCode = 1;
    } finally {
      process.exit(exitCode);
    }
  });
}
