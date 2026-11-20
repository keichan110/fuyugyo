import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCoverageReport, COVERAGE_REPORT_MARKER } from './coverage-report.mjs';

const root = '/repo';

/** 4指標とも同じカバー数・総数のファイル集計を作る */
function coverage(covered, total) {
  const metric = { covered, total, pct: total === 0 ? 100 : (covered / total) * 100 };
  return { lines: metric, statements: metric, functions: metric, branches: metric };
}

const summary = {
  total: coverage(60, 100),
  '/repo/src/server/a.ts': coverage(9, 10),
  '/repo/src/server/db/b.ts': coverage(1, 10),
  '/repo/src/features/shifts/api.ts': coverage(50, 50),
  '/repo/src/features/shifts/components/api.ts': coverage(0, 30),
};

const thresholds = {
  lines: 50,
  statements: 50,
  functions: 50,
  branches: 70,
  perFile: false,
  'src/server/**': { lines: 60 },
  'src/features/*/api.ts': { lines: 90, branches: 90 },
};

/** 表から対象の行を取り出す */
function row(report, label) {
  return report.split('\n').find((line) => line.startsWith(`| ${label} |`));
}

test('先頭に目印を置き、計測コミットを短縮して載せる', () => {
  const report = buildCoverageReport({ summary, thresholds, root, sha: 'a'.repeat(40) });
  assert.equal(report.split('\n')[0], COVERAGE_REPORT_MARKER);
  assert.match(report, /計測コミット: `aaaaaaa`/);
});

test('全体は summary の値で判定し、閾値のない指標は率だけを載せる', () => {
  const report = buildCoverageReport({ summary, thresholds, root });
  assert.equal(
    row(report, 'src 全体'),
    '| src 全体 | 4 | ✅ 60%（≥ 50） | ✅ 60%（≥ 50） | ✅ 60%（≥ 50） | ❌ 60%（≥ 70） |',
  );
  assert.doesNotMatch(report, /計測コミット/);
});

test('glob ごとに該当ファイルを合算して判定し、指標名以外の設定キーは行にしない', () => {
  const report = buildCoverageReport({ summary, thresholds, root });
  // server は 10/20 = 50% で閾値 60 を下回る。閾値のない指標は率のみ
  assert.equal(
    row(report, '`src/server/**`'),
    '| `src/server/**` | 2 | ❌ 50%（≥ 60） | 50% | 50% | 50% |',
  );
  // components/api.ts は `*` が1階層のみのため含めない
  assert.equal(
    row(report, '`src/features/*/api.ts`'),
    '| `src/features/*/api.ts` | 1 | ✅ 100%（≥ 90） | 100% | 100% | ✅ 100%（≥ 90） |',
  );
  assert.equal(row(report, 'perFile'), undefined);
});

test('該当ファイルがない glob は総数0として100%にする', () => {
  const report = buildCoverageReport({
    summary,
    thresholds: { 'src/none/**': { lines: 80 } },
    root,
  });
  assert.equal(
    row(report, '`src/none/**`'),
    '| `src/none/**` | 0 | ✅ 100%（≥ 80） | 100% | 100% | 100% |',
  );
});
