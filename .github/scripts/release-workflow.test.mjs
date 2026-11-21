import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * ワークフロー YAML の記述から、PR・リリースの合否に関わる設定を読み取って検証する。
 * 実際の GitHub Actions の実行結果ではなく、記述が意図どおりかを固定するテスト。
 * YAML パーサを増やさないよう、必要な行だけをテキストとして読む。
 */

const workflowsDir = new URL('../workflows/', import.meta.url);
const readWorkflow = (name) => readFileSync(new URL(name, workflowsDir), 'utf8');

/** `jobs:` 直下のジョブ名から、そのジョブの本文（インデント付き行の塊）への対応を作る。 */
function splitJobs(text) {
  const jobs = new Map();
  const start = text.indexOf('\njobs:\n');
  assert.notEqual(start, -1, 'jobs: がありません');
  let current = null;
  for (const line of text.slice(start + '\njobs:\n'.length).split('\n')) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = header[1];
      jobs.set(current, []);
    } else if (current !== null) {
      jobs.get(current).push(line);
    }
  }
  return new Map([...jobs].map(([name, lines]) => [name, lines.join('\n')]));
}

/** ジョブ直下（インデント 4）の `needs:` を配列で返す。 */
function needsOf(jobBody) {
  const inline = /^ {4}needs:\s*(.+)$/m.exec(jobBody);
  assert.ok(inline, 'needs がありません');
  return inline[1]
    .replace(/[[\]]/g, '')
    .split(',')
    .map((name) => name.trim());
}

/** ジョブ直下（インデント 4）の `if:` を返す。無ければ null。 */
function conditionOf(jobBody) {
  return /^ {4}if:\s*(.+)$/m.exec(jobBody)?.[1].trim() ?? null;
}

/**
 * GitHub Actions のジョブ開始条件を再現する。
 * `if` に状態関数（success/failure/always/cancelled）が無いジョブは暗黙の `success()` が付き、
 * `needs` がすべて success でなければ開始しない。`if` は
 * `needs.<job>.result == '<値>'` の `&&` 連結だけを許し、それ以外の式が混ざったら失敗させる。
 */
function jobStarts(jobBody, results) {
  const condition = conditionOf(jobBody);
  if (condition !== null) {
    assert.doesNotMatch(
      condition,
      /\b(always|failure|cancelled|success)\s*\(/,
      '状態関数を使う条件は依存ジョブの失敗・キャンセルを素通りさせうる',
    );
  }
  const implicitSuccess = needsOf(jobBody).every((job) => results[job] === 'success');
  if (!implicitSuccess) return false;
  if (condition === null) return true;
  return condition.split('&&').every((clause) => {
    const matched = /^needs\.([a-z0-9-]+)\.result == '([a-z]+)'$/.exec(clause.trim());
    assert.ok(matched, `想定外の条件式: ${clause}`);
    return results[matched[1]] === matched[2];
  });
}

const release = readWorkflow('release.yml');
const releaseJobs = splitJobs(release);

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
    for (const line of text.split('\n')) {
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
  assert.match(release, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(release, /^ {2}(push|pull_request|schedule):/m);
  assert.match(releaseJobs.get('prepare'), /github\.ref == 'refs\/heads\/main'/);
  assert.match(
    release,
    /concurrency:\n {2}group: deploy-production\n {2}cancel-in-progress: false/,
  );
});

test('後続ジョブは prepare が採番した同じ SHA を検証・デプロイする', () => {
  for (const name of ['build', 'e2e', 'deploy', 'release']) {
    assert.match(
      releaseJobs.get(name),
      /ref: \$\{\{ needs\.prepare\.outputs\.sha \}\}/,
      `${name} が採番した SHA を checkout していません`,
    );
  }
  assert.match(releaseJobs.get('prepare'), /ref: \$\{\{ github\.sha \}\}/);
});

test('build の成果物を e2e と deploy が同じ名前で受け取り、再ビルドしない', () => {
  // ステップ（`- name:` 始まり）単位に分け、保存ステップだけを取り出す。
  const upload = releaseJobs
    .get('build')
    .split(/\n(?= {6}- name:)/)
    .find((step) => /upload-artifact@/.test(step) && /name: release-build/.test(step));
  assert.ok(upload, 'build が release-build を保存していません');
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /include-hidden-files: true/);
  assert.match(upload, /\.wrangler\/deploy\/config\.json/);
  for (const name of ['e2e', 'deploy']) {
    assert.match(
      releaseJobs.get(name),
      /actions\/download-artifact@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+name: release-build\n/,
      `${name} が release-build を受け取っていません`,
    );
    assert.doesNotMatch(
      releaseJobs.get(name),
      /pnpm run build|vite build/,
      `${name} が再ビルドしています`,
    );
  }
  assert.match(releaseJobs.get('e2e'), /run: pnpm run test:e2e:release/);
  assert.match(releaseJobs.get('build'), /run: pnpm run build/);
});

test('deploy は build と全件 E2E が success のときだけ開始する（失敗・skip・キャンセルで止まる）', () => {
  const deploy = releaseJobs.get('deploy');
  assert.deepEqual([...needsOf(deploy)].sort(), ['build', 'e2e', 'prepare']);
  assert.match(deploy, /environment:\n\s+name: production/);

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
  // 公開の `if` は prepare の出力（ドラフトの有無）で、依存ジョブの状態は暗黙の success() に任せる。
  assert.match(conditionOf(publish), /needs\.prepare\.outputs\.draft == 'true'/);
  assert.doesNotMatch(conditionOf(publish), /\b(always|failure|cancelled)\s*\(/);
});

test('E2E の失敗トレース保存は失敗時のみで、deploy の判定に影響しない', () => {
  const e2e = releaseJobs.get('e2e');
  assert.match(e2e, /name: Upload failed E2E traces\n\s+if: failure\(\)/);
  assert.doesNotMatch(releaseJobs.get('deploy'), /release-playwright-results/);
});

test('PR の必須ジョブは静的チェック・カバレッジ付きテスト・スモーク E2E を実行する', () => {
  const quality = readWorkflow('quality-check.yml');
  const jobs = splitJobs(quality);
  assert.deepEqual([...jobs.keys()].sort(), ['coverage-comment', 'e2e', 'static', 'test']);
  assert.match(jobs.get('static'), /run: pnpm run typecheck/);
  assert.match(jobs.get('static'), /run: pnpm run lint/);
  assert.match(jobs.get('static'), /run: pnpm run format:check/);
  assert.match(jobs.get('test'), /run: pnpm run test:coverage/);
  assert.match(jobs.get('e2e'), /run: pnpm run test:e2e:smoke/);
  // 必須チェックではない投稿専用ジョブは、テストの合否判定を持たない。
  assert.doesNotMatch(jobs.get('coverage-comment'), /pnpm run test/);
});
