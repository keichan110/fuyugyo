import { readFileSync } from 'node:fs';
import { matchesGlob, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** PR コメントを探し当てて上書きするための目印。レポートの先頭行に置く */
export const COVERAGE_REPORT_MARKER = '<!-- fuyugyo-coverage-report -->';

const metrics = ['lines', 'statements', 'functions', 'branches'];

/** 閾値判定と表示を揃えるため、istanbul-lib-coverage と同じ式で小数第2位まで切り捨てる（総数 0 は 100%） */
function percent({ covered, total }) {
  return total > 0 ? Math.floor((1000 * 100 * covered) / total / 10) / 100 : 100;
}

function formatCell(pct, threshold) {
  if (threshold === undefined) {
    return `${pct}%`;
  }
  return `${pct >= threshold ? '✅' : '❌'} ${pct}%（≥ ${threshold}）`;
}

function formatRow(label, fileCount, pcts, thresholds = {}) {
  const cells = metrics.map((metric) => formatCell(pcts[metric], thresholds[metric]));
  return `| ${label} | ${fileCount} | ${cells.join(' | ')} |`;
}

/**
 * Vitest の json-summary と coverage.thresholds から、全体と glob ごとのカバー率を Markdown の表にする。
 * glob ごとの値は Vitest の閾値判定と同じく、該当ファイルのカバー数・総数を合算して求める。
 *
 * @param {object} options
 * @param {Record<string, Record<string, { covered: number, total: number, pct: number }>>} options.summary
 *   `coverage-summary.json` の内容（キーは `total` と各ファイルの絶対パス）
 * @param {Record<string, unknown>} options.thresholds `vitest.config.ts` の `coverage.thresholds`
 * @param {string} options.root ファイルパスを glob と照合するための基準ディレクトリ
 * @param {string} [options.sha] 計測したコミット
 * @returns {string} 先頭に {@link COVERAGE_REPORT_MARKER} を置いた Markdown
 */
export function buildCoverageReport({ summary, thresholds, root, sha }) {
  const files = Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, coverage]) => ({ path: relative(root, path), coverage }));

  const rows = [
    formatRow(
      'src 全体',
      files.length,
      Object.fromEntries(metrics.map((metric) => [metric, summary.total[metric].pct])),
      thresholds,
    ),
  ];
  // 指標名・perFile などのキーを除き、値がオブジェクトのものを glob ごとの閾値として扱う
  for (const [glob, globThresholds] of Object.entries(thresholds)) {
    if (metrics.includes(glob) || typeof globThresholds !== 'object' || globThresholds === null) {
      continue;
    }
    const matched = files.filter((file) => matchesGlob(file.path, glob));
    const pcts = Object.fromEntries(
      metrics.map((metric) => [
        metric,
        percent({
          covered: matched.reduce((sum, file) => sum + file.coverage[metric].covered, 0),
          total: matched.reduce((sum, file) => sum + file.coverage[metric].total, 0),
        }),
      ]),
    );
    rows.push(formatRow(`\`${glob}\``, matched.length, pcts, globThresholds));
  }

  return [
    COVERAGE_REPORT_MARKER,
    '## テストカバレッジ',
    '',
    ...(sha ? [`計測コミット: \`${sha.slice(0, 7)}\``, ''] : []),
    '| 対象 | ファイル数 | Lines | Statements | Functions | Branches |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '閾値は `vitest.config.ts` の `coverage.thresholds`。UI 層は E2E が主体のため全体値にのみ含める。',
    '',
  ].join('\n');
}

// CLI: node .github/scripts/coverage-report.mjs <coverage-summary.json>（リポジトリ直下で実行）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summaryPath = process.argv[2];
  if (!summaryPath) {
    throw new Error('coverage-summary.json のパスを指定してください');
  }
  const { default: config } = await import(pathToFileURL(resolve('vitest.config.ts')).href);
  process.stdout.write(
    buildCoverageReport({
      summary: JSON.parse(readFileSync(summaryPath, 'utf8')),
      thresholds: config.test?.coverage?.thresholds ?? {},
      root: process.cwd(),
      sha: process.env.COVERAGE_SHA,
    }),
  );
}
