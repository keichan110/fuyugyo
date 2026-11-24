import { expect, it } from 'vitest';

import { scripts } from '../package.json';

it('カバレッジ実行がNodeテストの両入口を省略しない', () => {
  // Node側の入口検査自身が除外されても、独立したVitest側から設定の欠落を検出する。
  expect(scripts['test:coverage']).toBe(
    'pnpm run test:scripts && vitest run --coverage --testTimeout=20000',
  );
  expect(scripts['test:scripts']).toBe('node --test scripts/*.test.mjs .github/scripts/*.test.mjs');
});
