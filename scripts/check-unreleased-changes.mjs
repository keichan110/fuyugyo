import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const marker = '<!-- fuyugyo:unreleased-changes -->';
const title = '未リリースの変更があります';

/** GitHub のページをすべて読み、件数制限による取りこぼしを防ぐ。 */
async function listPages(request, path) {
  const items = [];
  for (let page = 1; ; page++) {
    const batch = await request(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

/** PR タイトルを Markdown のリンク文言として表示する。 */
function escapeTitle(value) {
  return value.replace(/[\r\n]/g, ' ').replace(/[\\[\]]/g, '\\$&');
}

/**
 * 最新の公開 Release と main の差分を調べ、管理用 issue を作成・更新・クローズする。
 * API と git の境界を引数で受け、外部への書き込みなしで状態遷移を検証できる。
 */
export async function checkUnreleasedChanges({ repository, request, git }) {
  const root = `/repos/${repository}`;
  const release = await request(`${root}/releases/latest`);
  const head = git('rev-parse', 'HEAD').trim();
  let base;
  if (release) {
    // Release が参照するタグを明示取得し、注釈付きタグもコミットに解決する。
    git('fetch', '--no-tags', 'origin', `refs/tags/${release.tag_name}`);
    base = git('rev-parse', '--verify', 'FETCH_HEAD^{commit}').trim();
    // 分岐した履歴を「リリース済み」と誤認しない。失敗時は issue を変更せず終了する。
    git('merge-base', '--is-ancestor', base, head);
  }
  const commits = git('rev-list', ...(base ? [`${base}..${head}`] : [head]))
    .trim()
    .split('\n')
    .filter(Boolean);
  const issues = await listPages(
    request,
    `${root}/issues?state=all&creator=github-actions%5Bbot%5D`,
  );
  const existing = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));

  if (commits.length === 0) {
    if (existing?.state === 'open') {
      await request(`${root}/issues/${existing.number}`, 'PATCH', { state: 'closed' });
    }
    return 'released';
  }

  const prs = new Map();
  let directCommits = 0;
  for (const sha of commits) {
    const associated = await listPages(request, `${root}/commits/${sha}/pulls`);
    const merged = associated.filter(
      (pr) =>
        pr.merged_at &&
        pr.base.ref === 'main' &&
        pr.base.repo.full_name.toLowerCase() === repository.toLowerCase(),
    );
    if (merged.length === 0) directCommits++;
    for (const pr of merged) prs.set(pr.number, pr);
  }
  const compareUrl = release
    ? `https://github.com/${repository}/compare/${encodeURIComponent(release.tag_name)}...${head}`
    : `https://github.com/${repository}/commits/${head}`;
  const lines = [
    marker,
    'main に本番へ未反映の変更があります。Release ワークフローによる反映を確認してください。',
    '',
    release
      ? `最新 Release: [${escapeTitle(release.tag_name)}](${release.html_url})`
      : '公開 Release はまだありません。',
    `確認した main: \`${head}\``,
    `[未リリースの差分](${compareUrl})（${commits.length}コミット）`,
    '',
    '## 未リリースの PR',
    '',
  ];
  const sorted = [...prs.values()].sort((a, b) => a.number - b.number);
  // issue 本文の上限を超えないよう一覧を制限し、全差分へのリンクを必ず残す。
  for (const pr of sorted.slice(0, 100)) {
    lines.push(`- [#${pr.number} ${escapeTitle(pr.title).slice(0, 300)}](${pr.html_url})`);
  }
  if (sorted.length === 0)
    lines.push('該当する PR はありません。コミットの差分を確認してください。');
  if (sorted.length > 100)
    lines.push(`ほか ${sorted.length - 100} 件。全体は上の差分リンクを確認してください。`);
  if (directCommits > 0) lines.push('', `PR に対応しないコミット: ${directCommits} 件。`);
  lines.push('', 'この issue は Weekly Maintenance が更新し、リリース後の次回実行で閉じます。');
  const payload = { title, body: lines.join('\n'), state: 'open' };
  if (existing) await request(`${root}/issues/${existing.number}`, 'PATCH', payload);
  else await request(`${root}/issues`, 'POST', { title, body: payload.body });
  return 'unreleased';
}

/** GitHub API の失敗を検知し、誤った issue 更新を防ぐ。 */
async function requestGitHub(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 && method === 'GET' && path.endsWith('/releases/latest')) return null;
  if (!response.ok) throw new Error(`GitHub API ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY) {
    throw new Error('GH_TOKEN と GITHUB_REPOSITORY が必要です');
  }
  const result = await checkUnreleasedChanges({
    repository: process.env.GITHUB_REPOSITORY,
    request: requestGitHub,
    git: (...args) => execFileSync('git', args, { encoding: 'utf8' }),
  });
  console.log(`未リリース検知: ${result}`);
}
