/**
 * production build の Worker と静的アセットを再ビルドせずにローカル配信する。
 * 差し替えるのは実行時変数と永続化先だけで、dist とデプロイ設定には書き込まない。
 */
import { spawn } from 'node:child_process';

import {
  E2E_BASE_URL,
  E2E_JWT_EXPIRES_IN,
  E2E_JWT_SECRET,
  E2E_PERSIST_DIR,
  E2E_PORT,
} from './env.ts';

const variables = {
  JWT_SECRET: E2E_JWT_SECRET,
  JWT_EXPIRES_IN: E2E_JWT_EXPIRES_IN,
  JWT_REFRESH_INTERVAL: '15m',
  JWT_ABSOLUTE_EXPIRES_IN: '7d',
  LINE_CHANNEL_SECRET: 'e2e-dummy-line-channel-secret',
  APP_URL: E2E_BASE_URL,
  SENTRY_DSN: '',
};

const worker = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--config',
    'dist/fuyugyo/wrangler.json',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(E2E_PORT),
    '--persist-to',
    E2E_PERSIST_DIR,
    '--inspector-port',
    '0',
    ...Object.entries(variables).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => worker.kill(signal));
}
worker.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
worker.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
