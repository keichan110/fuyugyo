import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * ワークフロー YAML の記述から、PR・リリースの合否に関わる設定を読み取って検証する。
 * 実際の GitHub Actions の実行結果ではなく、記述が意図どおりかを固定するテスト。
 * YAML パーサを増やさないよう、このリポジトリのワークフローが使うインデント形式だけを読む。
 * コメントは除いたうえで、キーと値の構造（ジョブ・ステップ・with）として読む。
 * 複数行の値（`if`・`needs` の折り返しやブロックスカラー）など、読み取れない構文は
 * 見逃さずに失敗させる（危険な条件を足した変更が素通りしないようにするため）。
 */

const workflowsDir = new URL('../workflows/', import.meta.url);
const readWorkflow = (name) => readFileSync(new URL(name, workflowsDir), 'utf8');

const indentOf = (line) => line.length - line.trimStart().length;

/** 引用符の外にある `#` 以降（YAML のコメント）を除く。 */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

/** コメント・空行を除いた行の配列にする。 */
function codeLines(text) {
  return text
    .split('\n')
    .map(stripComment)
    .filter((line) => line.trim() !== '');
}

/**
 * 指定インデントのキーごとに、同じ行の値と配下の行を集める。
 * 同じインデントにキー以外の行（リスト項目など）や重複キーがあれば失敗させる。
 */
function parseMapping(lines, indent) {
  const map = new Map();
  let current = null;
  for (const line of lines) {
    const depth = indentOf(line);
    if (depth === indent) {
      const matched = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line.trim());
      assert.ok(matched, `想定外の行: ${line}`);
      assert.ok(!map.has(matched[1]), `キーが重複しています: ${matched[1]}`);
      current = { value: (matched[2] ?? '').trim(), lines: [] };
      map.set(matched[1], current);
    } else {
      assert.ok(depth > indent && current !== null, `想定外のインデント: ${line}`);
      current.lines.push(line);
    }
  }
  return map;
}

/** 同じ行に収まる 1 行の値だけを返す。折り返し・ブロックスカラーは未対応として失敗させる。 */
function scalarOf(entry, label) {
  assert.ok(entry, `${label} がありません`);
  assert.equal(entry.lines.length, 0, `${label} が複数行です（未対応の構文）`);
  assert.ok(entry.value !== '' && !/^[|>][+-]?$/.test(entry.value), `${label} が複数行です`);
  return entry.value;
}

/** 1 行の値、またはブロックスカラーの本文（行ごとに前後の空白を除き改行で連結）を返す。 */
function textOf(entry, label) {
  assert.ok(entry, `${label} がありません`);
  if (/^[|>][+-]?$/.test(entry.value)) {
    return entry.lines.map((line) => line.trim()).join('\n');
  }
  assert.equal(entry.lines.length, 0, `${label} が想定外の複数行です`);
  return entry.value;
}

/** `jobs:` 直下のジョブ名から、ジョブ直下（インデント 4）のキーの対応を作る。 */
function parseJobs(text) {
  const lines = codeLines(text);
  const start = lines.findIndex((line) => line === 'jobs:');
  assert.notEqual(start, -1, 'jobs: がありません');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (indentOf(line) === 0) break;
    body.push(line);
  }
  const jobs = new Map();
  for (const [name, entry] of parseMapping(body, 2)) {
    jobs.set(name, parseMapping(entry.lines, 4));
  }
  return jobs;
}

/** ジョブの `steps:` を、ステップごとのキー対応（`with` は別に展開）の配列にする。 */
function stepsOf(job) {
  const entry = job.get('steps');
  assert.ok(entry, 'steps がありません');
  const items = [];
  for (const line of entry.lines) {
    if (indentOf(line) === 6) {
      assert.ok(line.trimStart().startsWith('- '), `想定外のステップ行: ${line}`);
      // 先頭のキーも他のキーと同じインデント（8）にそろえて読む。
      items.push([`${' '.repeat(8)}${line.trimStart().slice(2)}`]);
    } else {
      assert.ok(items.length > 0, `想定外のステップ行: ${line}`);
      items.at(-1).push(line);
    }
  }
  return items.map((stepLines) => {
    const fields = parseMapping(stepLines, 8);
    const withEntry = fields.get('with');
    return { fields, with: withEntry ? parseMapping(withEntry.lines, 10) : new Map() };
  });
}

/** ステップのうち、条件に合う 1 件だけを返す（0 件・複数件は失敗）。 */
function findStep(job, label, predicate) {
  const matched = stepsOf(job).filter(predicate);
  assert.equal(matched.length, 1, `${label} が ${matched.length} 件あります`);
  return matched[0];
}

const usesOf = (step) => step.fields.get('uses')?.value ?? '';
const stepNameOf = (step) => step.fields.get('name')?.value ?? '';

/** ジョブ直下の `needs:` を配列で返す。 */
function needsOf(job) {
  return scalarOf(job.get('needs'), 'needs')
    .replace(/[[\]]/g, '')
    .split(',')
    .map((name) => name.trim());
}

/** ジョブ直下の `if:` を返す。無ければ null。 */
function conditionOf(job) {
  return job.has('if') ? scalarOf(job.get('if'), 'if') : null;
}

/**
 * GitHub Actions のジョブ開始条件を再現する。
 * `if` に状態関数（success/failure/always/cancelled）が無いジョブは暗黙の `success()` が付き、
 * `needs` がすべて success でなければ開始しない。`if` は
 * `needs.<job>.result == '<値>'` の `&&` 連結だけを許し、それ以外の式が混ざったら失敗させる。
 */
function jobStarts(job, results) {
  const condition = conditionOf(job);
  if (condition !== null) {
    assert.doesNotMatch(
      condition,
      /\b(always|failure|cancelled|success)\s*\(/,
      '状態関数を使う条件は依存ジョブの失敗・キャンセルを素通りさせうる',
    );
  }
  const implicitSuccess = needsOf(job).every((name) => results[name] === 'success');
  if (!implicitSuccess) return false;
  if (condition === null) return true;
  return condition.split('&&').every((clause) => {
    const matched = /^needs\.([a-z0-9-]+)\.result == '([a-z]+)'$/.exec(clause.trim());
    assert.ok(matched, `想定外の条件式: ${clause}`);
    return results[matched[1]] === matched[2];
  });
}

const release = readWorkflow('release.yml');
const releaseTop = parseMapping(codeLines(release), 0);
const releaseJobs = parseJobs(release);
const checkoutRef = (job, label) =>
  findStep(job, label, (step) => usesOf(step).startsWith('actions/checkout@')).with.get('ref')
    ?.value;

test('解析器: コメントと複数行の条件を実設定と取り違えない', () => {
  const sample = [
    'jobs:',
    '  a:',
    '    # if: always()',
    '    needs: x # [y]',
    "    if: needs.x.result == 'success'",
    '    steps:',
    '      # - name: Fake',
    '      #   run: pnpm run build',
    '      - name: Real',
    '        run: echo ok # pnpm run build',
    '  b:',
    '    needs: x',
    "    if: needs.x.result == 'success' &&",
    '      always()',
    '  c:',
    '    needs: x',
    '    if: >-',
    "      needs.x.result == 'success' || always()",
    '',
  ].join('\n');
  const jobs = parseJobs(sample);
  const a = jobs.get('a');
  assert.deepEqual(needsOf(a), ['x']);
  assert.equal(conditionOf(a), "needs.x.result == 'success'");
  assert.deepEqual(stepsOf(a).map(stepNameOf), ['Real']);
  assert.equal(stepsOf(a)[0].fields.get('run').value, 'echo ok');
  assert.throws(() => conditionOf(jobs.get('b')), /複数行/);
  assert.throws(() => conditionOf(jobs.get('c')), /複数行/);
  assert.throws(() => jobStarts(jobs.get('c'), { x: 'success' }), /複数行/);
});

test('外部アクションはすべてコミット SHA で固定されている', () => {
  const files = [
    ...readdirSync(workflowsDir).map((name) => ({
      path: `workflows/${name}`,
      text: readWorkflow(name),
    })),
    {
      path: 'actions/setup/action.yml',
      text: readFileSync(new URL('../actions/setup/action.yml', import.meta.url), 'utf8'),
    },
  ];
  let checked = 0;
  for (const { path, text } of files) {
    for (const line of codeLines(text)) {
      const matched = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
      if (!matched || matched[1].startsWith('./')) continue;
      checked += 1;
      assert.match(
        matched[1],
        /@[0-9a-f]{40}$/,
        `${path}: ${matched[1]} が SHA 固定ではありません`,
      );
    }
  }
  assert.ok(checked > 0, '外部アクションが 1 件も見つかりません');
});

test('リリースは手動起動のみで、main 以外・実行中の取り消しを許さない', () => {
  const triggers = parseMapping(releaseTop.get('on').lines, 2);
  assert.deepEqual([...triggers.keys()], ['workflow_dispatch']);
  const prepareCondition = scalarOf(releaseJobs.get('prepare').get('if'), 'prepare の if');
  assert.doesNotMatch(prepareCondition, /\|\||\b(always|failure|cancelled)\s*\(/);
  assert.ok(
    prepareCondition
      .split('&&')
      .some((clause) => clause.trim() === "github.ref == 'refs/heads/main'"),
    'prepare が main 以外でも動きます',
  );
  const concurrency = parseMapping(releaseTop.get('concurrency').lines, 2);
  assert.equal(scalarOf(concurrency.get('group'), 'concurrency.group'), 'deploy-production');
  assert.equal(scalarOf(concurrency.get('cancel-in-progress'), 'cancel-in-progress'), 'false');
});

test('後続ジョブは prepare が採番した同じ SHA を検証・デプロイする', () => {
  for (const name of ['build', 'e2e', 'deploy', 'release']) {
    assert.equal(
      checkoutRef(releaseJobs.get(name), `${name} の checkout`),
      '${{ needs.prepare.outputs.sha }}',
      `${name} が採番した SHA を checkout していません`,
    );
  }
  assert.equal(checkoutRef(releaseJobs.get('prepare'), 'prepare の checkout'), '${{ github.sha }}');
});

test('build の成果物を e2e と deploy が同じ名前で受け取り、再ビルドしない', () => {
  const upload = findStep(
    releaseJobs.get('build'),
    'build の成果物保存',
    (step) =>
      usesOf(step).startsWith('actions/upload-artifact@') &&
      step.with.get('name')?.value === 'release-build',
  );
  assert.equal(scalarOf(upload.with.get('if-no-files-found'), 'if-no-files-found'), 'error');
  assert.equal(scalarOf(upload.with.get('include-hidden-files'), 'include-hidden-files'), 'true');
  assert.ok(
    textOf(upload.with.get('path'), 'path').split('\n').includes('.wrangler/deploy/config.json'),
    '保存対象に .wrangler/deploy/config.json がありません',
  );
  // 成果物の保存より先に e2e が始まらないよう、build への依存を固定する。
  assert.deepEqual([...needsOf(releaseJobs.get('e2e'))].sort(), ['build', 'prepare']);
  for (const name of ['e2e', 'deploy']) {
    const job = releaseJobs.get(name);
    findStep(
      job,
      `${name} の成果物受け取り`,
      (step) =>
        usesOf(step).startsWith('actions/download-artifact@') &&
        step.with.get('name')?.value === 'release-build',
    );
    for (const step of stepsOf(job)) {
      const run = step.fields.get('run');
      if (run)
        assert.doesNotMatch(
          textOf(run, 'run'),
          /pnpm run build|vite build/,
          `${name} が再ビルドしています`,
        );
    }
  }
  const runsOf = (name) =>
    stepsOf(releaseJobs.get(name)).map((step) => step.fields.get('run')?.value);
  assert.ok(
    runsOf('e2e').includes('pnpm run test:e2e:release'),
    'e2e が全件 E2E を実行していません',
  );
  assert.ok(runsOf('build').includes('pnpm run build'), 'build がビルドしていません');
});

test('deploy は build と全件 E2E が success のときだけ開始する（失敗・skip・キャンセルで止まる）', () => {
  const deploy = releaseJobs.get('deploy');
  assert.deepEqual([...needsOf(deploy)].sort(), ['build', 'e2e', 'prepare']);
  const environment = parseMapping(deploy.get('environment').lines, 6);
  assert.equal(scalarOf(environment.get('name'), 'environment.name'), 'production');

  const statuses = ['success', 'failure', 'skipped', 'cancelled'];
  let started = 0;
  for (const prepare of statuses) {
    for (const build of statuses) {
      for (const e2e of statuses) {
        const starts = jobStarts(deploy, { prepare, build, e2e });
        const allSuccess = [prepare, build, e2e].every((value) => value === 'success');
        assert.equal(
          starts,
          allSuccess,
          `prepare=${prepare} build=${build} e2e=${e2e} で deploy の開始可否が想定と異なります`,
        );
        if (starts) started += 1;
      }
    }
  }
  assert.equal(started, 1);
});

test('health-check と公開は deploy・health-check の成功後にだけ進む', () => {
  assert.equal(jobStarts(releaseJobs.get('health-check'), { deploy: 'success' }), true);
  for (const deploy of ['failure', 'skipped', 'cancelled']) {
    assert.equal(jobStarts(releaseJobs.get('health-check'), { deploy }), false);
  }
  const publish = releaseJobs.get('release');
  assert.deepEqual([...needsOf(publish)].sort(), ['deploy', 'health-check', 'prepare']);
  // 公開の `if` は prepare の出力（ドラフトの有無）だけで、依存ジョブの状態は暗黙の success() に任せる。
  assert.equal(conditionOf(publish), "needs.prepare.outputs.draft == 'true'");
});

test('E2E の失敗トレース保存は失敗時のみで、deploy の判定に影響しない', () => {
  const traces = findStep(
    releaseJobs.get('e2e'),
    'E2E の失敗トレース保存',
    (step) => stepNameOf(step) === 'Upload failed E2E traces',
  );
  assert.equal(scalarOf(traces.fields.get('if'), 'トレース保存の if'), 'failure()');
  assert.ok(usesOf(traces).startsWith('actions/upload-artifact@'));
  for (const step of stepsOf(releaseJobs.get('deploy'))) {
    assert.notEqual(step.with.get('name')?.value, 'release-playwright-results');
  }
});

test('PR の必須ジョブは静的チェック・カバレッジ付きテスト・スモーク E2E を実行する', () => {
  const jobs = parseJobs(readWorkflow('quality-check.yml'));
  assert.deepEqual([...jobs.keys()].sort(), ['coverage-comment', 'e2e', 'static', 'test']);
  const runsOf = (name) =>
    stepsOf(jobs.get(name)).map((step) => step.fields.get('run')?.value ?? '');
  for (const command of ['typecheck', 'lint', 'format:check']) {
    assert.ok(
      runsOf('static').includes(`pnpm run ${command}`),
      `static が ${command} を実行していません`,
    );
  }
  assert.ok(runsOf('test').includes('pnpm run test:coverage'));
  assert.ok(runsOf('e2e').includes('pnpm run test:e2e:smoke'));
  // 必須チェックではない投稿専用ジョブは、テストの合否判定を持たない。
  for (const run of runsOf('coverage-comment')) assert.doesNotMatch(run, /pnpm run test/);
});
