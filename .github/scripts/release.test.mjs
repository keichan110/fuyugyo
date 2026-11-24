import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { otherCategoryTitle, releaseCategories, runRelease } from './release.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const repo = 'repos/example/app';
const env = { GITHUB_REPOSITORY: 'example/app', GITHUB_RUN_ID: '123', RELEASE_SHA: sha };

function fixture({
  releases = [],
  refs = [],
  approval = true,
  commitSha = otherSha,
  notes = '新しい変更一覧',
  labels = {},
  commitPulls = {},
  pullDetails = {},
  git = () => '',
} = {}) {
  const calls = [];
  const api = async (path, method = 'GET', data) => {
    calls.push({ path, method, data });
    if (path === `${repo}/environments/production`) {
      return {
        can_admins_bypass: false,
        protection_rules: approval ? [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }] : [],
      };
    }
    if (path.startsWith(`${repo}/releases?`)) {
      return structuredClone(releases);
    }
    if (path === `${repo}/git/matching-refs/tags/`) {
      return refs;
    }
    const related = path.match(
      /^repos\/example\/app\/commits\/([^/?]+)\/pulls\?per_page=100&page=(\d+)$/,
    );
    if (related) {
      const pulls = commitPulls[related[1]] ?? [];
      return structuredClone(pulls.slice((Number(related[2]) - 1) * 100, Number(related[2]) * 100));
    }
    const pull = path.match(/^repos\/example\/app\/pulls\/(\d+)$/);
    if (pull) {
      return {
        labels: (labels[pull[1]] ?? []).map((name) => ({ name })),
        merged_at: '2026-01-02T00:00:00Z',
        base: { repo: { full_name: 'example/app' } },
        ...pullDetails[pull[1]],
      };
    }
    if (path.startsWith(`${repo}/commits/`)) {
      return { sha: commitSha };
    }
    if (path.endsWith('/generate-notes')) {
      return { body: notes };
    }
    if (path === `${repo}/releases` && method === 'POST') {
      const release = { id: 1, html_url: 'https://example.com/release', ...data };
      releases.push(release);
      return structuredClone(release);
    }
    const release = releases.find((item) => path === `${repo}/releases/${item.id}`);
    assert.ok(release, `想定外の API: ${path}`);
    if (method === 'PATCH') {
      // GitHub はタグ未作成のドラフトを tag_name なしで更新すると untagged-* に置き換える
      const untagged =
        release.draft &&
        data.tag_name === undefined &&
        !refs.some((ref) => ref.ref === `refs/tags/${release.tag_name}`);
      Object.assign(release, data, untagged ? { tag_name: `untagged-${release.id}` } : {});
    }
    return structuredClone(release);
  };
  return { api, calls, releases, git };
}

async function prepared() {
  const state = fixture();
  const candidate = await runRelease('prepare', env, state.api, state.git);
  const candidateEnv = {
    ...env,
    RELEASE_ID: String(candidate.id),
    RELEASE_TAG: candidate.tag,
    RELEASE_DRAFT: 'true',
  };
  return { ...state, candidate, candidateEnv };
}

test('ドラフトを固定 SHA で作り、承認・検証後に本文を保持して公開する', async () => {
  const state = await prepared();
  assert.equal(state.releases[0].target_commitish, sha);
  assert.equal(state.releases[0].draft, true);
  state.releases[0].body += '\n確認者が追記した運用メモ';
  await runRelease('verify', state.candidateEnv, state.api);
  const approvedBody = state.releases[0].body;
  await runRelease('publish', state.candidateEnv, state.api);
  assert.equal(state.releases[0].draft, false);
  assert.equal(state.releases[0].body, approvedBody);
  assert.match(approvedBody, /確認者が追記した運用メモ/);
  assert.equal(state.releases[0].tag_name, state.candidate.tag);
  assert.deepEqual(state.calls.at(-1).data, {
    tag_name: state.candidate.tag,
    target_commitish: sha,
    draft: false,
    make_latest: 'true',
  });
});

test('同じ SHA の再実行は同じドラフトと編集済み本文を再利用する', async () => {
  const state = await prepared();
  state.releases[0].body = state.releases[0].body.replace(
    '新しい変更一覧',
    '手動で修正した変更一覧',
  );
  const body = state.releases[0].body;
  const candidate = await runRelease('prepare', env, state.api, state.git);
  assert.equal(candidate.id, state.candidate.id);
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].body, body);
  assert.equal(state.calls.filter((call) => call.path.endsWith('/generate-notes')).length, 1);
});

test('別 SHA への更新は自動生成部分だけ置換し、古い実行のデプロイを拒否する', async () => {
  const state = await prepared();
  state.releases[0].body =
    state.releases[0].body.replace('新しい変更一覧', '古い変更一覧') + '\n保持するメモ';
  await runRelease(
    'prepare',
    { ...env, RELEASE_SHA: otherSha, GITHUB_RUN_ID: '456' },
    state.api,
    state.git,
  );
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].target_commitish, otherSha);
  assert.match(state.releases[0].body, /新しい変更一覧/);
  assert.match(state.releases[0].body, /保持するメモ/);
  assert.doesNotMatch(state.releases[0].body, /古い変更一覧/);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), /ドラフトが更新/);
});

test('同じ SHA でも別の実行で更新された候補は古い実行からデプロイしない', async () => {
  const state = await prepared();
  await runRelease('prepare', { ...env, GITHUB_RUN_ID: '456' }, state.api, state.git);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), /ドラフトが更新/);
});

test('デプロイ開始後に別 SHA で上書きせず、失敗したドラフトを残す', async () => {
  const state = await prepared();
  await runRelease('verify', state.candidateEnv, state.api);
  await assert.rejects(
    runRelease('prepare', { ...env, RELEASE_SHA: otherSha }, state.api, state.git),
    /デプロイ開始済み/,
  );
  assert.equal(state.releases[0].draft, true);
  assert.equal(state.releases[0].target_commitish, sha);
  await runRelease('prepare', env, state.api, state.git);
  assert.match(state.releases[0].body, /"deployStarted":true/);
});

test('承認ルール未設定ならドラフト準備も本番操作前の検証も停止する', async () => {
  const missing = fixture({ approval: false });
  await assert.rejects(runRelease('prepare', env, missing.api, missing.git), /Required reviewers/);
  assert.equal(missing.releases.length, 0);
  const state = await prepared();
  const unprotected = fixture({ releases: state.releases, approval: false });
  await assert.rejects(
    runRelease('verify', state.candidateEnv, unprotected.api),
    /Required reviewers/,
  );
  assert.doesNotMatch(state.releases[0].body, /"deployStarted":true/);
});

test('デプロイ開始記録がなければ公開しない', async () => {
  const state = await prepared();
  await assert.rejects(runRelease('publish', state.candidateEnv, state.api), /デプロイ開始/);
  assert.equal(state.releases[0].draft, true);
});

test('既存タグが別 SHA を指す場合はデプロイしない', async () => {
  const state = await prepared();
  const changed = fixture({
    releases: state.releases,
    refs: [{ ref: `refs/tags/${state.candidate.tag}` }],
  });
  await assert.rejects(runRelease('verify', state.candidateEnv, changed.api), /既存タグの SHA/);
});

test('公開済みリリースは更新せず再デプロイする', async () => {
  const state = fixture({
    releases: [
      {
        id: 9,
        tag_name: 'v2026.01.01',
        draft: false,
        prerelease: false,
        published_at: '2026-01-01',
        html_url: 'https://example.com/release',
      },
    ],
  });
  const candidate = await runRelease(
    'prepare',
    { ...env, RELEASE_SHA: otherSha },
    state.api,
    state.git,
  );
  assert.equal(candidate.id, 9);
  assert.equal(candidate.draft, false);
  assert.equal(state.calls.filter((call) => call.method !== 'GET').length, 0);
});

test('公開済みタグと未公開ドラフトの両方を避けて採番する', async () => {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const base = `v${date.replaceAll('-', '.')}`;
  const state = fixture({
    releases: [{ tag_name: `${base}.2`, draft: true }],
    refs: [{ ref: `refs/tags/${base}` }],
  });
  const candidate = await runRelease('prepare', env, state.api, state.git);
  assert.equal(candidate.tag, `${base}.3`);
});

test('最新公開版と同じ SHA でも未公開ドラフトが残っていれば更新せず停止する', async () => {
  const state = await prepared();
  const original = structuredClone(state.releases[0]);
  state.releases.push({
    id: 9,
    tag_name: 'v2026.01.01',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01',
  });
  const redeploy = fixture({ releases: state.releases, commitSha: sha });
  await assert.rejects(runRelease('prepare', env, redeploy.api, redeploy.git), /未公開のドラフト/);
  assert.deepEqual(state.releases[0], original);
  assert.equal(redeploy.calls.filter((call) => call.method !== 'GET').length, 0);
});

test('公開済みリリースの再デプロイ検証は承認設定とタグを確認し、本文を変更しない', async () => {
  const release = {
    id: 9,
    tag_name: 'v2026.01.01',
    draft: false,
    prerelease: false,
    body: '公開済みの本文',
  };
  const candidateEnv = {
    ...env,
    RELEASE_ID: '9',
    RELEASE_TAG: release.tag_name,
    RELEASE_DRAFT: 'false',
  };
  const state = fixture({
    releases: [release],
    refs: [{ ref: `refs/tags/${release.tag_name}` }],
    commitSha: sha,
  });
  await runRelease('verify', candidateEnv, state.api);
  assert.ok(state.calls.some((call) => call.path.endsWith('/environments/production')));
  assert.equal(state.calls.filter((call) => call.method !== 'GET').length, 0);
  assert.equal(release.body, '公開済みの本文');
  const unprotected = fixture({
    releases: [release],
    refs: [{ ref: `refs/tags/${release.tag_name}` }],
    commitSha: sha,
    approval: false,
  });
  await assert.rejects(runRelease('verify', candidateEnv, unprotected.api), /Required reviewers/);
});

test('再デプロイ検証はタグ欠落・別 SHA・プレリリースを拒否する', async () => {
  const release = { id: 9, tag_name: 'v2026.01.01', draft: false, prerelease: false };
  const candidateEnv = {
    ...env,
    RELEASE_ID: '9',
    RELEASE_TAG: release.tag_name,
    RELEASE_DRAFT: 'false',
  };
  const missing = fixture({ releases: [release] });
  await assert.rejects(runRelease('verify', candidateEnv, missing.api), /正式リリース/);
  const moved = fixture({ releases: [release], refs: [{ ref: `refs/tags/${release.tag_name}` }] });
  await assert.rejects(runRelease('verify', candidateEnv, moved.api), /既存タグの SHA/);
  const prerelease = fixture({
    releases: [{ ...release, prerelease: true }],
    refs: [{ ref: `refs/tags/${release.tag_name}` }],
    commitSha: sha,
  });
  await assert.rejects(runRelease('verify', candidateEnv, prerelease.api), /正式リリース/);
});

test('管理情報が壊れた候補は準備・デプロイ検証ともに書き込まず停止する', async () => {
  const state = await prepared();
  state.releases[0].body = '<!-- fuyugyo-release:{broken} -->';
  state.calls.length = 0;
  await assert.rejects(runRelease('prepare', env, state.api, state.git), SyntaxError);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), SyntaxError);
  assert.equal(state.calls.filter((call) => call.method !== 'GET').length, 0);
  assert.equal(state.releases[0].draft, true);
});

const repository = 'example/app';
const pullUrl = (number) => `https://github.com/${repository}/pull/${number}`;
const prLine = (title, number) => `* ${title} by @someone in ${pullUrl(number)}`;
// commits/{sha}/pulls の応答は merged_at や base を返さない場合がある。照合は番号だけに使う。
const mergedPull = (number) => ({ number });

/** 一時 Git リポジトリを作り、コミットと実 git の実行関数を返す。 */
function createRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: dir, encoding: 'utf8' },
    );
  run(['init', '-q', '-b', 'main']);
  let count = 0;
  const commit = (files = {}, { remove = [], move = [] } = {}) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    for (const path of remove) {
      run(['rm', '-q', path]);
    }
    for (const [from, to] of move) {
      mkdirSync(dirname(join(dir, to)), { recursive: true });
      run(['mv', from, to]);
    }
    run(['add', '-A']);
    run(['commit', '-q', '--allow-empty', '-m', `commit ${++count}`]);
    return run(['rev-parse', 'HEAD']).trim();
  };
  return { dir, run, commit, git: (args) => run(args) };
}

const draftOf = (state) => state.releases.find((release) => release.draft);
const dbHeading = '## 🗃️ DB マイグレーションあり';

test('PR は全該当カテゴリに1回ずつ載り、同じカテゴリへ対応するラベルが重なっても重複しない', async () => {
  const notes = [
    "## What's Changed",
    prLine('機能追加', 1),
    prLine('CI 更新', 2),
    prLine('ラベルなし', 3),
    prLine('内部変更', 4),
    prLine('脆弱性修正', 5),
    '',
    '## New Contributors',
    `* @someone made their first contribution in ${pullUrl(3)}`,
    '',
    `**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n');
  const state = fixture({
    notes,
    labels: {
      1: ['enhancement', 'db-migration'],
      2: ['ci-cd', 'devops'],
      4: ['skip-changelog', 'bug'],
      5: ['bug', 'security', 'dependencies'],
    },
    // 比較元の解決だけ成功させ、DB 変更のないコミット履歴として扱う
    git: (args) => (args[0] === 'rev-parse' ? sha : ''),
  });
  await runRelease('prepare', env, state.api, state.git);
  const body = draftOf(state).body;
  const section = (title, ...lines) => `## ${title}\n${lines.join('\n')}`;
  const expected = [
    section('✨ 機能追加・改善', prLine('機能追加', 1)),
    section('🐛 バグ修正', prLine('脆弱性修正', 5)),
    section('🔒 セキュリティ', prLine('脆弱性修正', 5)),
    section('🗃️ DB マイグレーションあり', prLine('機能追加', 1)),
    section('⬆️ 依存関係の更新', prLine('脆弱性修正', 5)),
    section('🔧 CI・運用', prLine('CI 更新', 2)),
    section('その他の変更', prLine('ラベルなし', 3)),
    `## New Contributors\n* @someone made their first contribution in ${pullUrl(3)}\n\n**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n\n');
  assert.ok(body.includes(`<!-- release-notes:start -->\n${expected}\n<!-- release-notes:end -->`));
  assert.doesNotMatch(body, /内部変更/);
});

test('カテゴリの順序とラベル対応は .github/release.yml と一致する', () => {
  const config = readFileSync(new URL('../release.yml', import.meta.url), 'utf8');
  const parsed = [];
  for (const line of config.split('\n')) {
    const title = line.match(/^ {4}- title: (.+)$/);
    if (title) {
      parsed.push({ title: title[1], labels: [] });
    }
    const label = line.match(/^ {8}- '?([^']+)'?$/);
    if (label && parsed.length > 0) {
      parsed.at(-1).labels.push(label[1]);
    }
  }
  const other = parsed.pop();
  assert.equal(other.title, otherCategoryTitle);
  assert.deepEqual(
    parsed,
    releaseCategories.map(({ title, labels }) => ({ title, labels })),
  );
});

test('範囲内の drizzle/ の変更を PR 行またはコミットとパスで載せ、範囲外は含めない', async (t) => {
  const local = createRepo(t);
  const rootCommit = local.commit({ 'drizzle/0000_init.sql': 'a', 'src/app.ts': 'a' });
  const released = local.commit({ 'drizzle/0001_old.sql': 'a' });
  local.run(['tag', 'v2026.01.01', released]);
  const viaPull = local.commit({ 'drizzle/0002_a.sql': 'a' });
  const direct = local.commit(
    { 'drizzle/meta/日本 語.json': '{}' },
    { move: [['drizzle/0002_a.sql', 'drizzle/0002_b.sql']] },
  );
  const excluded = local.commit({}, { remove: ['drizzle/meta/日本 語.json'] });
  const unmerged = local.commit({ 'drizzle/0003_c.sql': 'a' });
  const appOnly = local.commit({ 'src/app.ts': 'b' });
  const notes = [prLine('マイグレーション追加', 10), prLine('アプリ変更', 12)].join('\n');
  const state = fixture({
    releases: [
      {
        id: 9,
        tag_name: 'v2026.01.01',
        draft: false,
        prerelease: false,
        published_at: '2026-01-01',
      },
    ],
    notes,
    commitPulls: {
      [rootCommit]: [mergedPull(1)],
      [released]: [mergedPull(2)],
      [viaPull]: [mergedPull(10)],
      [direct]: [],
      // 通常一覧にない PR（skip-changelog などで除外）は PR 行にならない
      [excluded]: [mergedPull(11)],
      // マージされていない PR は、関連 API の応答ではなく PR の詳細で判定して対応付けない
      [unmerged]: [mergedPull(12)],
      [appOnly]: [mergedPull(12)],
    },
    pullDetails: { 12: { merged_at: null } },
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: appOnly }, state.api, state.git);
  const body = draftOf(state).body;
  const link = (commit) =>
    `[\`${commit.slice(0, 7)}\`](https://github.com/${repository}/commit/${commit})`;
  const database = [
    dbHeading,
    prLine('マイグレーション追加', 10),
    `* ${link(direct)} \`drizzle/0002_a.sql\`（削除）、\`drizzle/0002_b.sql\`（追加）、\`drizzle/meta/日本 語.json\`（追加）`,
    `* ${link(excluded)} \`drizzle/meta/日本 語.json\`（削除）`,
    `* ${link(unmerged)} \`drizzle/0003_c.sql\`（追加）`,
  ].join('\n');
  assert.ok(body.includes(database), body);
  // DB へ補完された PR は「その他の変更」には重ねない
  assert.ok(body.includes(`## その他の変更\n${prLine('アプリ変更', 12)}\n`));
  assert.equal(body.split(prLine('マイグレーション追加', 10)).length, 2);
  assert.doesNotMatch(body, /0000_init|0001_old/);
  assert.equal(draftOf(state).target_commitish, appOnly);
  assert.equal(state.calls.filter((call) => call.path.includes('/pulls?')).length, 4);
});

test('db-migration ラベルがなくても PR に対応付いた drizzle/ の変更は DB カテゴリに載る', async (t) => {
  const local = createRepo(t);
  const base = local.commit({ 'src/app.ts': 'a' });
  local.run(['tag', 'v1', base]);
  const change = local.commit({ 'drizzle/0001_a.sql': 'a' });
  const state = fixture({
    releases: [
      { id: 9, tag_name: 'v1', draft: false, prerelease: false, published_at: '2026-01-01' },
    ],
    notes: prLine('機能', 1),
    labels: { 1: ['enhancement'] },
    commitPulls: { [change]: [mergedPull(1)] },
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: change }, state.api, state.git);
  assert.ok(
    draftOf(state).body.includes(
      `## ✨ 機能追加・改善\n${prLine('機能', 1)}\n\n${dbHeading}\n${prLine('機能', 1)}\n`,
    ),
  );
  assert.doesNotMatch(draftOf(state).body, /commit\//);
});

test('コミットに関連する PR の一覧はページングして取得する', async (t) => {
  const local = createRepo(t);
  const base = local.commit({ 'src/app.ts': 'a' });
  local.run(['tag', 'v1', base]);
  const change = local.commit({ 'drizzle/0001_a.sql': 'a' });
  const fillers = Array.from({ length: 100 }, (_, i) => mergedPull(1000 + i));
  const state = fixture({
    releases: [
      { id: 9, tag_name: 'v1', draft: false, prerelease: false, published_at: '2026-01-01' },
    ],
    notes: prLine('機能', 150),
    commitPulls: { [change]: [...fillers, mergedPull(150)] },
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: change }, state.api, state.git);
  assert.ok(draftOf(state).body.includes(`${dbHeading}\n${prLine('機能', 150)}\n`));
  assert.doesNotMatch(draftOf(state).body, /commit\//);
});

test('初回は generate-notes が示す比較元から、示さなければ全履歴から検出する', async (t) => {
  const local = createRepo(t);
  const root = local.commit({ 'drizzle/0000_init.sql': 'a' });
  local.run(['tag', 'v0.9', local.commit({ 'drizzle/0001_x.sql': 'a' })]);
  const head = local.commit({ 'drizzle/0002_y.sql': 'a' });
  const link = (commit) => `[\`${commit.slice(0, 7)}\`]`;

  const compared = fixture({
    notes: `${prLine('機能', 1)}\n\n**Full Changelog**: https://github.com/${repository}/compare/v0.9...v1`,
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: head }, compared.api, compared.git);
  assert.match(draftOf(compared).body, /0002_y\.sql/);
  assert.doesNotMatch(draftOf(compared).body, /0000_init|0001_x/);

  const full = fixture({
    notes: `${prLine('機能', 1)}\n\n**Full Changelog**: https://github.com/${repository}/commits/v1`,
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: head }, full.api, full.git);
  // ルートコミットは空ツリーとの差分で検出する
  assert.ok(draftOf(full).body.includes(link(root)));
  assert.match(draftOf(full).body, /0000_init\.sql`（追加）/);
  assert.match(draftOf(full).body, /0001_x\.sql/);
  assert.match(draftOf(full).body, /0002_y\.sql/);
});

test('比較元・履歴・API の取得に失敗したらドラフトを保存しない', async (t) => {
  const local = createRepo(t);
  const base = local.commit({ 'src/app.ts': 'a' });
  local.run(['tag', 'v1', base]);
  const change = local.commit({ 'drizzle/0001_a.sql': 'a' });
  const published = {
    id: 9,
    tag_name: 'v1',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01',
  };
  const saved = (state) =>
    state.calls.filter(
      (call) =>
        call.path.startsWith(`${repo}/releases`) &&
        call.method !== 'GET' &&
        !call.path.endsWith('/generate-notes'),
    );
  const cases = [
    ['比較元のタグ', { releases: [{ ...published, tag_name: 'v9' }], git: local.git }, /比較元/],
    [
      '初回の比較元',
      {
        notes: `**Full Changelog**: https://github.com/${repository}/compare/missing...v1`,
        git: local.git,
      },
      /比較元/,
    ],
    [
      '履歴の取得',
      {
        releases: [published],
        git: () => {
          throw new Error('git 失敗');
        },
      },
      /git 失敗|比較元/,
    ],
  ];
  for (const [name, options, pattern] of cases) {
    const state = fixture(options);
    await assert.rejects(
      runRelease('prepare', { ...env, RELEASE_SHA: change }, state.api, state.git),
      pattern,
      name,
    );
    assert.equal(state.releases.filter((release) => release.draft).length, 0, name);
  }
  const state = fixture({ releases: [published], notes: prLine('機能', 1), git: local.git });
  const failing = (path, ...rest) => {
    if (path.includes('/pulls')) {
      throw new Error('API 失敗');
    }
    return state.api(path, ...rest);
  };
  await assert.rejects(
    runRelease('prepare', { ...env, RELEASE_SHA: change }, failing, state.git),
    /API 失敗/,
  );
  assert.equal(state.releases.filter((release) => release.draft).length, 0);
  assert.equal(saved(state).length, 0);
});

test('関連 API が merged_at を返さなくても、PR の詳細で検証して DB カテゴリへ補完する', async (t) => {
  const local = createRepo(t);
  const base = local.commit({ 'src/app.ts': 'a' });
  local.run(['tag', 'v1', base]);
  const merged = local.commit({ 'drizzle/0001_a.sql': 'a' });
  const unmerged = local.commit({ 'drizzle/0002_b.sql': 'a' });
  const foreignBase = local.commit({ 'drizzle/0003_c.sql': 'a' });
  const state = fixture({
    releases: [
      { id: 9, tag_name: 'v1', draft: false, prerelease: false, published_at: '2026-01-01' },
    ],
    notes: [prLine('機能', 1), prLine('未マージ', 2), prLine('別 base', 3)].join('\n'),
    labels: { 1: ['enhancement'], 2: ['enhancement'], 3: ['enhancement'] },
    commitPulls: {
      [merged]: [mergedPull(1)],
      [unmerged]: [mergedPull(2)],
      [foreignBase]: [mergedPull(3)],
    },
    pullDetails: {
      2: { merged_at: null },
      3: { base: { repo: { full_name: 'other/app' } } },
    },
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: foreignBase }, state.api, state.git);
  const body = draftOf(state).body;
  const link = (commit) =>
    `[\`${commit.slice(0, 7)}\`](https://github.com/${repository}/commit/${commit})`;
  assert.ok(
    body.includes(
      [
        dbHeading,
        prLine('機能', 1),
        `* ${link(unmerged)} \`drizzle/0002_b.sql\`（追加）`,
        `* ${link(foreignBase)} \`drizzle/0003_c.sql\`（追加）`,
      ].join('\n'),
    ),
    body,
  );
});

test('マージコミットは全親と比較し、main の取り込みは PR に帰属させず競合解決はコミットで示す', async (t) => {
  const local = createRepo(t);
  const base = local.commit({ 'drizzle/meta/_journal.json': 'base', 'src/app.ts': 'a' });
  local.run(['tag', 'v1', base]);
  local.run(['checkout', '-q', '-b', 'feature']);
  const featureCommit = local.commit({ 'src/feature.ts': 'a' });
  local.run(['checkout', '-q', 'main']);
  const mainCommit = local.commit({ 'drizzle/0001_main.sql': 'a' });
  local.run(['checkout', '-q', 'feature']);
  // main の取り込み。マイグレーションの変更は取り込みだけで、PR 自体は変更していない
  local.run(['merge', '-q', '--no-ff', '-m', 'merge main', 'main']);
  const imported = local.run(['rev-parse', 'HEAD']).trim();
  // 競合解決。双方と異なる内容でマージする
  local.run(['checkout', '-q', 'main']);
  const mainJournal = local.commit({ 'drizzle/meta/_journal.json': 'main' });
  local.run(['checkout', '-q', 'feature']);
  local.commit({ 'drizzle/meta/_journal.json': 'feature' });
  assert.throws(() => local.run(['merge', '--no-ff', '-m', 'resolve', 'main']));
  writeFileSync(join(local.dir, 'drizzle/meta/_journal.json'), 'resolved');
  local.run(['add', '-A']);
  local.run(['commit', '-q', '-m', 'resolve']);
  const resolved = local.run(['rev-parse', 'HEAD']).trim();
  const link = (commit) =>
    `[\`${commit.slice(0, 7)}\`](https://github.com/${repository}/commit/${commit})`;
  const state = fixture({
    releases: [
      { id: 9, tag_name: 'v1', draft: false, prerelease: false, published_at: '2026-01-01' },
    ],
    notes: [prLine('機能', 1), prLine('main の変更', 2)].join('\n'),
    labels: { 1: ['enhancement'], 2: ['enhancement'] },
    commitPulls: {
      [featureCommit]: [mergedPull(1)],
      [imported]: [mergedPull(1)],
      [mainCommit]: [mergedPull(2)],
      [mainJournal]: [mergedPull(2)],
      [resolved]: [mergedPull(1)],
    },
    git: local.git,
  });
  await runRelease('prepare', { ...env, RELEASE_SHA: resolved }, state.api, state.git);
  const body = draftOf(state).body;
  const database = body.slice(body.indexOf(dbHeading));
  // PR 1 は DB を変更していないため DB カテゴリに載らない。PR 2 は自身のコミットで載る
  assert.ok(database.startsWith(`${dbHeading}\n${prLine('main の変更', 2)}\n`), body);
  assert.ok(!database.includes(prLine('機能', 1)));
  assert.ok(database.includes(`* ${link(resolved)} \`drizzle/meta/_journal.json\`（更新）`), body);
  assert.doesNotMatch(body, new RegExp(imported.slice(0, 7)));
});

test('複数行の PR 項目を1項目として保持し、分類・除外・重複排除する', async () => {
  const multi = (title, number) =>
    `* ${title.replace(' ', '\n')} by @someone in ${pullUrl(number)}`;
  const foreign = '* 他リポジトリの変更 by @someone in https://github.com/other/app/pull/7';
  const notes = [
    "## What's Changed",
    multi('機能 追加', 1),
    multi('除外 対象', 2),
    prLine('単一行', 3),
    foreign,
    '',
    `**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n');
  const state = fixture({
    notes,
    labels: { 1: ['enhancement', 'bug'], 2: ['skip-changelog', 'bug'], 3: ['dependencies'] },
    git: (args) => (args[0] === 'rev-parse' ? sha : ''),
  });
  await runRelease('prepare', env, state.api, state.git);
  const body = draftOf(state).body;
  const section = (title, ...lines) => `## ${title}\n${lines.join('\n')}`;
  const expected = [
    section('✨ 機能追加・改善', multi('機能 追加', 1)),
    section('🐛 バグ修正', multi('機能 追加', 1)),
    section('⬆️ 依存関係の更新', prLine('単一行', 3)),
    section('その他の変更', foreign),
    `**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n\n');
  assert.ok(
    body.includes(`<!-- release-notes:start -->\n${expected}\n<!-- release-notes:end -->`),
    body,
  );
  assert.doesNotMatch(body, /除外/);
});

test('継続行が見出し・箇条書き記号で始まる除外 PR の断片を残さず、前後の項目と比較リンクを保持する', async () => {
  const tricky = (number) => `* 題名\n\n## 詳細\n* 続き by @user in ${pullUrl(number)}`;
  const foreign = '* 他リポジトリ by @someone in https://github.com/other/app/pull/7';
  const notes = [
    "## What's Changed",
    prLine('前の項目', 1),
    tricky(2),
    prLine('後の項目', 3),
    tricky(4),
    foreign,
    '',
    '## New Contributors',
    `* @someone made their first contribution in ${pullUrl(3)}`,
    '',
    `**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n');
  const state = fixture({
    notes,
    labels: { 1: ['enhancement'], 2: ['skip-changelog'], 3: ['bug'], 4: ['enhancement'] },
    git: (args) => (args[0] === 'rev-parse' ? sha : ''),
  });
  await runRelease('prepare', env, state.api, state.git);
  const body = draftOf(state).body;
  const section = (title, ...lines) => `## ${title}\n${lines.join('\n')}`;
  const expected = [
    section('✨ 機能追加・改善', prLine('前の項目', 1), tricky(4)),
    section('🐛 バグ修正', prLine('後の項目', 3)),
    section('その他の変更', foreign),
    `## New Contributors\n* @someone made their first contribution in ${pullUrl(3)}\n\n**Full Changelog**: https://github.com/${repository}/compare/v1...v2`,
  ].join('\n\n');
  assert.ok(
    body.includes(`<!-- release-notes:start -->\n${expected}\n<!-- release-notes:end -->`),
    body,
  );
  // 除外 PR（#2）の題名・見出し様の継続行・続きはいずれも残らない
  assert.equal(body.split('題名').length, 2);
  assert.equal(body.split(pullUrl(2)).length, 1);
});

test('終端の PR URL がないまま本文が終わる項目はドラフトを保存しない', async () => {
  const notes = ["## What's Changed", prLine('前', 1), '* 終端のない項目', '継続行'].join('\n');
  const state = fixture({ notes, git: (args) => (args[0] === 'rev-parse' ? sha : '') });
  await assert.rejects(runRelease('prepare', env, state.api, state.git), /分類できません/);
  assert.equal(state.releases.length, 0);
});

test('分類できない同一リポジトリの PR 項目は黙って落とさず、ドラフトを保存しない', async () => {
  for (const notes of [
    `* 形式が違う項目 ${pullUrl(1)}`,
    ["## What's Changed", prLine('機能', 1), '', `補足 ${pullUrl(2)}`].join('\n'),
  ]) {
    const state = fixture({ notes, git: (args) => (args[0] === 'rev-parse' ? sha : '') });
    await assert.rejects(runRelease('prepare', env, state.api, state.git), /分類できません/);
    assert.equal(state.releases.length, 0);
  }
});
