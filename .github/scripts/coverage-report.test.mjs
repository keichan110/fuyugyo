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

/** ファイルごとに Branches の未カバー数だけを指定した summary を作る */
function branchSummary(entries) {
  const result = { total: coverage(0, 0) };
  for (const [path, covered, total] of entries) {
    result[`/repo/${path}`] = { ...coverage(0, 0), branches: { covered, total, pct: 0 } };
  }
  return result;
}

/** 未カバー分岐の表の行（ヘッダー行を除く）を取り出す */
function uncoveredRows(report) {
  const lines = report.split('\n');
  const start = lines.findIndex((line) => line.startsWith('### 未カバー分岐'));
  return lines.slice(start).filter((line) => /^\| `/.test(line));
}

test('未カバー分岐の多い順に並べ、同数はパス順にして未カバー数・総数・率を載せる', () => {
  const report = buildCoverageReport({
    summary: branchSummary([
      ['src/z.ts', 6, 10],
      ['src/b.ts', 6, 10],
      ['src/a.ts', 1, 2],
      ['src/big.ts', 50, 100],
    ]),
    thresholds: {},
    root,
  });
  assert.deepEqual(uncoveredRows(report), [
    '| `src/big.ts` | 50 | 100 | 50% |',
    '| `src/b.ts` | 4 | 10 | 60% |',
    '| `src/z.ts` | 4 | 10 | 60% |',
    '| `src/a.ts` | 1 | 2 | 50% |',
  ]);
  assert.match(report, /UI と業務リスクの優先順位は別物/);
});

test('未カバー分岐の表は上位10件までで、未カバーのないファイルは載せない', () => {
  const entries = Array.from({ length: 12 }, (_, index) => [
    `src/f${String(index).padStart(2, '0')}.ts`,
    0,
    index + 1,
  ]);
  entries.push(['src/full.ts', 5, 5], ['src/none.ts', 0, 0]);
  const rows = uncoveredRows(
    buildCoverageReport({ summary: branchSummary(entries), thresholds: {}, root }),
  );
  assert.equal(rows.length, 10);
  assert.equal(rows[0], '| `src/f11.ts` | 12 | 12 | 0% |');
  assert.equal(rows[9], '| `src/f02.ts` | 3 | 3 | 0% |');
  assert.ok(rows.every((line) => !line.includes('full.ts') && !line.includes('none.ts')));
});

test('未カバーの分岐がなければ表の代わりに説明を載せる', () => {
  const report = buildCoverageReport({
    summary: branchSummary([['src/full.ts', 5, 5]]),
    thresholds: {},
    root,
  });
  assert.match(report, /未カバーの分岐を持つファイルはありません/);
  assert.deepEqual(uncoveredRows(report), []);
});

test('未カバー分岐の表を足しても既存の集計行と目印は変わらない', () => {
  const report = buildCoverageReport({ summary, thresholds, root });
  assert.equal(report.split('\n')[0], COVERAGE_REPORT_MARKER);
  assert.equal(
    row(report, 'src 全体'),
    '| src 全体 | 4 | ✅ 60%（≥ 50） | ✅ 60%（≥ 50） | ✅ 60%（≥ 50） | ❌ 60%（≥ 70） |',
  );
  // 既存の4指標の表は、未カバー分岐の節より前に置く
  assert.ok(report.indexOf('| 対象 |') < report.indexOf('### 未カバー分岐'));
});
