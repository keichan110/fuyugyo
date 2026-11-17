import assert from 'node:assert/strict';
import test from 'node:test';

import { runRelease } from './release.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const repo = 'repos/example/app';
const env = { GITHUB_REPOSITORY: 'example/app', GITHUB_RUN_ID: '123', RELEASE_SHA: sha };

function fixture({ releases = [], refs = [], approval = true, commitSha = otherSha } = {}) {
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
    if (path.startsWith(`${repo}/commits/`)) {
      return { sha: commitSha };
    }
    if (path.endsWith('/generate-notes')) {
      return { body: '新しい変更一覧' };
    }
    if (path === `${repo}/releases` && method === 'POST') {
      const release = { id: 1, html_url: 'https://example.com/release', ...data };
      releases.push(release);
      return structuredClone(release);
    }
    const release = releases.find((item) => path === `${repo}/releases/${item.id}`);
    assert.ok(release, `想定外の API: ${path}`);
    if (method === 'PATCH') {
      Object.assign(release, data);
    }
    return structuredClone(release);
  };
  return { api, calls, releases };
}

async function prepared() {
  const state = fixture();
  const candidate = await runRelease('prepare', env, state.api);
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
  assert.deepEqual(state.calls.at(-1).data, { draft: false, make_latest: 'true' });
});

test('同じ SHA の再実行は同じドラフトと編集済み本文を再利用する', async () => {
  const state = await prepared();
  state.releases[0].body = state.releases[0].body.replace(
    '新しい変更一覧',
    '手動で修正した変更一覧',
  );
  const body = state.releases[0].body;
  const candidate = await runRelease('prepare', env, state.api);
  assert.equal(candidate.id, state.candidate.id);
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].body, body);
  assert.equal(state.calls.filter((call) => call.path.endsWith('/generate-notes')).length, 1);
});

test('別 SHA への更新は自動生成部分だけ置換し、古い実行のデプロイを拒否する', async () => {
  const state = await prepared();
  state.releases[0].body =
    state.releases[0].body.replace('新しい変更一覧', '古い変更一覧') + '\n保持するメモ';
  await runRelease('prepare', { ...env, RELEASE_SHA: otherSha, GITHUB_RUN_ID: '456' }, state.api);
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].target_commitish, otherSha);
  assert.match(state.releases[0].body, /新しい変更一覧/);
  assert.match(state.releases[0].body, /保持するメモ/);
  assert.doesNotMatch(state.releases[0].body, /古い変更一覧/);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), /ドラフトが更新/);
});

test('同じ SHA でも別の実行で更新された候補は古い実行からデプロイしない', async () => {
  const state = await prepared();
  await runRelease('prepare', { ...env, GITHUB_RUN_ID: '456' }, state.api);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), /ドラフトが更新/);
});

test('デプロイ開始後に別 SHA で上書きせず、失敗したドラフトを残す', async () => {
  const state = await prepared();
  await runRelease('verify', state.candidateEnv, state.api);
  await assert.rejects(
    runRelease('prepare', { ...env, RELEASE_SHA: otherSha }, state.api),
    /デプロイ開始済み/,
  );
  assert.equal(state.releases[0].draft, true);
  assert.equal(state.releases[0].target_commitish, sha);
  await runRelease('prepare', env, state.api);
  assert.match(state.releases[0].body, /"deployStarted":true/);
});

test('承認ルール未設定ならドラフト準備も本番操作前の検証も停止する', async () => {
  const missing = fixture({ approval: false });
  await assert.rejects(runRelease('prepare', env, missing.api), /Required reviewers/);
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
  const candidate = await runRelease('prepare', { ...env, RELEASE_SHA: otherSha }, state.api);
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
  const candidate = await runRelease('prepare', env, state.api);
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
  await assert.rejects(runRelease('prepare', env, redeploy.api), /未公開のドラフト/);
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
  await assert.rejects(runRelease('prepare', env, state.api), SyntaxError);
  await assert.rejects(runRelease('verify', state.candidateEnv, state.api), SyntaxError);
  assert.equal(state.calls.filter((call) => call.method !== 'GET').length, 0);
  assert.equal(state.releases[0].draft, true);
});
