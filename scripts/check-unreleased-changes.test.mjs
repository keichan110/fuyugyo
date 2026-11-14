import assert from 'node:assert/strict';
import test from 'node:test';

import { checkUnreleasedChanges } from './check-unreleased-changes.mjs';

const marker = '<!-- fuyugyo:unreleased-changes -->';
const release = {
  tag_name: 'v2026.11.12',
  html_url: 'https://github.com/owner/repo/releases/tag/v2026.11.12',
};
const pr = {
  number: 10,
  title: '依存を更新する',
  html_url: 'https://github.com/owner/repo/pull/10',
  merged_at: '2026-11-13T00:00:00Z',
  base: { ref: 'main', repo: { full_name: 'owner/repo' } },
};

/** 外部への書き込みを記録し、リリースと issue の状態遷移を検証する。 */
function fixture({
  latest = release,
  commits = ['sha1'],
  issues = [],
  associated = [pr],
  failApi = false,
  diverged = false,
} = {}) {
  const writes = [];
  const gitCalls = [];
  return {
    writes,
    gitCalls,
    options: {
      repository: 'owner/repo',
      git: (...args) => {
        gitCalls.push(args);
        if (args[0] === 'rev-parse') return args.includes('HEAD') ? 'head-sha' : 'release-sha';
        if (args[0] === 'rev-list') return commits.join('\n');
        if (args[0] === 'merge-base' && diverged) throw new Error('履歴が分岐しています');
        return '';
      },
      request: async (path, method = 'GET', body) => {
        if (method !== 'GET') {
          writes.push({ path, method, body });
          return {};
        }
        if (path.endsWith('/releases/latest')) return latest;
        if (path.includes('/issues?')) return issues;
        if (path.includes('/pulls?')) {
          if (failApi) throw new Error('GitHub API HTTP 403');
          return associated;
        }
        throw new Error(`未定義のリクエスト: ${path}`);
      },
    },
  };
}

test('未リリース PR を重複なく一覧化し、管理用 issue を作成する', async () => {
  const f = fixture({ commits: ['sha1', 'sha2'] });
  assert.equal(await checkUnreleasedChanges(f.options), 'unreleased');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].method, 'POST');
  assert.equal(f.writes[0].body.body.match(/#10 /g).length, 1);
  assert.match(f.writes[0].body.body, /2コミット/);
  assert.ok(
    f.gitCalls.some((args) => args.join(' ') === 'merge-base --is-ancestor release-sha head-sha'),
  );
});

test('同名の手動 issue を変更せず、管理用 issue を更新する', async () => {
  const f = fixture({
    issues: [
      { number: 1, title: '未リリースの変更があります', body: '手動メモ' },
      { number: 2, body: marker, state: 'open' },
    ],
  });
  await checkUnreleasedChanges(f.options);
  assert.equal(f.writes[0].path, '/repos/owner/repo/issues/2');
  assert.equal(f.writes[0].method, 'PATCH');
});

test('リリースが main に追いついたら管理用 issue を閉じる', async () => {
  const f = fixture({ commits: [], issues: [{ number: 2, body: marker, state: 'open' }] });
  assert.equal(await checkUnreleasedChanges(f.options), 'released');
  assert.deepEqual(f.writes[0].body, { state: 'closed' });
});

test('未リリース変更がなく管理用 issue もなければ何も作成しない', async () => {
  const f = fixture({ commits: [] });
  await checkUnreleasedChanges(f.options);
  assert.equal(f.writes.length, 0);
});

test('新しい未リリース変更があれば既存の管理用 issue を再オープンする', async () => {
  const f = fixture({ issues: [{ number: 2, body: marker, state: 'closed' }] });
  await checkUnreleasedChanges(f.options);
  assert.equal(f.writes[0].body.state, 'open');
});

test('初回リリース前は全コミットを未リリースとして扱い、PR がない変更も通知する', async () => {
  const f = fixture({ latest: null, associated: [] });
  await checkUnreleasedChanges(f.options);
  assert.match(f.writes[0].body.body, /公開 Release はまだありません/);
  assert.match(f.writes[0].body.body, /PR に対応しないコミット: 1 件/);
  assert.ok(!f.gitCalls.some((args) => args[0] === 'fetch'));
});

test('PR の取得に失敗した場合は不完全な issue で上書きしない', async () => {
  const f = fixture({ failApi: true });
  await assert.rejects(checkUnreleasedChanges(f.options), /HTTP 403/);
  assert.equal(f.writes.length, 0);
});

test('Release が main と分岐していたら通知を誤って閉じない', async () => {
  const f = fixture({
    diverged: true,
    commits: [],
    issues: [{ number: 2, body: marker, state: 'open' }],
  });
  await assert.rejects(checkUnreleasedChanges(f.options), /分岐/);
  assert.equal(f.writes.length, 0);
});

test('API の2ページ目の管理用 issue も検出する', async () => {
  const f = fixture();
  const request = f.options.request;
  f.options.request = async (path, ...args) => {
    if (path.includes('/issues?')) {
      return path.endsWith('page=1')
        ? Array.from({ length: 100 }, () => ({ body: '別の issue' }))
        : [{ number: 200, body: marker, state: 'open' }];
    }
    return request(path, ...args);
  };
  await checkUnreleasedChanges(f.options);
  assert.equal(f.writes[0].path, '/repos/owner/repo/issues/200');
});
