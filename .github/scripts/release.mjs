import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const marker = /<!-- fuyugyo-release:(.*?) -->/;
const notesStart = '<!-- release-notes:start -->';
const notesEnd = '<!-- release-notes:end -->';

function metadata(release) {
  const match = release.body?.match(marker);
  return match ? JSON.parse(match[1]) : undefined;
}

function ghApi(path, method = 'GET', data) {
  const args = ['api', path, '--method', method];
  if (data !== undefined) {
    args.push('--input', '-');
  }
  return JSON.parse(
    execFileSync('gh', args, {
      input: data === undefined ? undefined : JSON.stringify(data),
      encoding: 'utf8',
    }),
  );
}

async function listAll(api, path) {
  const result = [];
  for (let page = 1; ; page++) {
    const items = await api(`${path}?per_page=100&page=${page}`);
    result.push(...items);
    if (items.length < 100) {
      return result;
    }
  }
}

function updateBody(release, state, notes) {
  let body = release?.body ?? `${notesStart}\n\n${notesEnd}\n\n### 運用メモ\n\n`;
  if (notes !== undefined) {
    const start = body.indexOf(notesStart);
    const end = body.indexOf(notesEnd);
    if (start < 0 || end < start) {
      throw new Error('自動生成部分のマーカーを復元してください。');
    }
    body = body.slice(0, start + notesStart.length) + `\n${notes}\n` + body.slice(end);
  }
  body = body.replace(marker, '').trimEnd();
  return `${body}\n\n<!-- fuyugyo-release:${JSON.stringify(state)} -->\n`;
}

async function assertApproval(api, repo) {
  const environment = await api(`${repo}/environments/production`);
  const reviewers = environment.protection_rules?.find(
    (rule) => rule.type === 'required_reviewers',
  );
  if (!reviewers?.reviewers?.length || environment.can_admins_bypass !== false) {
    throw new Error(
      'production に Required reviewers を登録し、管理者による保護ルールのバイパスを無効にしてください。',
    );
  }
}

async function assertTag(api, repo, release, sha, refs) {
  if (refs.some((ref) => ref.ref === `refs/tags/${release.tag_name}`)) {
    const commit = await api(`${repo}/commits/${encodeURIComponent(release.tag_name)}`);
    if (commit.sha !== sha) {
      throw new Error('既存タグの SHA がリリース候補と一致しません。');
    }
  }
}

function nextTag(releases, refs) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const base = `v${date.replaceAll('-', '.')}`;
  const existing = new Set([
    ...releases.map((release) => release.tag_name),
    ...refs.map((ref) => ref.ref.replace('refs/tags/', '')),
  ]);
  let tag = base;
  for (let n = 2; existing.has(tag); n++) {
    tag = `${base}.${n}`;
  }
  return tag;
}

async function saveDraft(api, repo, env, draft, latest, tag) {
  const sha = env.RELEASE_SHA;
  const previous = draft && metadata(draft);
  let notes;
  if (!draft || previous.sha !== sha) {
    const generated = await api(`${repo}/releases/generate-notes`, 'POST', {
      tag_name: tag,
      target_commitish: sha,
      ...(latest ? { previous_tag_name: latest.tag_name } : {}),
    });
    notes = generated.body;
  }
  const state = {
    sha,
    runId: env.GITHUB_RUN_ID,
    deployStarted: previous?.sha === sha && previous.deployStarted === true,
  };
  const release = await api(
    draft ? `${repo}/releases/${draft.id}` : `${repo}/releases`,
    draft ? 'PATCH' : 'POST',
    {
      tag_name: tag,
      target_commitish: sha,
      name: draft?.name ?? tag,
      body: updateBody(draft, state, notes),
      draft: true,
      prerelease: false,
    },
  );
  return { tag, sha, id: release.id, draft: true, url: release.html_url };
}

async function prepareRelease(api, repo, env) {
  await assertApproval(api, repo);
  const releases = await listAll(api, `${repo}/releases`);
  const refs = await api(`${repo}/git/matching-refs/tags/`);
  const drafts = releases.filter((release) => release.draft && metadata(release));
  if (drafts.length > 1) {
    throw new Error('管理対象ドラフトを1件に整理してください。');
  }
  const draft = drafts[0];
  const previous = draft && metadata(draft);
  const sha = env.RELEASE_SHA;
  // 本番操作の途中で失敗した候補は別コミットで上書きせず、復旧するまで固定する。
  if (previous?.deployStarted && previous.sha !== sha) {
    throw new Error('デプロイ開始済みのドラフトが残っています。同じ SHA で復旧してください。');
  }
  const latest = releases
    .filter((release) => !release.draft && !release.prerelease)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  if (latest) {
    const commit = await api(`${repo}/commits/${encodeURIComponent(latest.tag_name)}`);
    if (commit.sha === sha) {
      // 再デプロイで未解決の候補を上書きしたり、同じ内容のリリースを増やしたりしない。
      if (draft) {
        throw new Error(
          '未公開のドラフトが残っています。候補を確認・整理してから再デプロイしてください。',
        );
      }
      return { tag: latest.tag_name, sha, id: latest.id, draft: false, url: latest.html_url };
    }
  }
  const tag = draft?.tag_name ?? nextTag(releases, refs);
  // 公開済みタグは動かさない。失敗時などにタグだけ存在する候補も同じ SHA に限定する。
  await assertTag(api, repo, { tag_name: tag }, sha, refs);
  return saveDraft(api, repo, env, draft, latest, tag);
}

async function loadCandidate(api, repo, env) {
  const release = await api(`${repo}/releases/${env.RELEASE_ID}`);
  if (release.tag_name !== env.RELEASE_TAG) {
    throw new Error('リリースタグが変更されています。');
  }
  const refs = await api(`${repo}/git/matching-refs/tags/`);
  await assertTag(api, repo, release, env.RELEASE_SHA, refs);
  if (env.RELEASE_DRAFT !== 'true') {
    if (
      release.draft ||
      release.prerelease ||
      !refs.some((ref) => ref.ref === `refs/tags/${release.tag_name}`)
    ) {
      throw new Error('再デプロイ対象は公開済みの正式リリースである必要があります。');
    }
    return { release };
  }
  const state = metadata(release);
  if (
    !release.draft ||
    release.prerelease ||
    release.target_commitish !== env.RELEASE_SHA ||
    state?.sha !== env.RELEASE_SHA ||
    state.runId !== env.GITHUB_RUN_ID
  ) {
    throw new Error('ドラフトが更新または公開されています。候補を準備し直してください。');
  }
  return { release, state };
}

async function verifyRelease(api, repo, candidate) {
  await assertApproval(api, repo);
  if (candidate.state) {
    await api(`${repo}/releases/${candidate.release.id}`, 'PATCH', {
      body: updateBody(candidate.release, { ...candidate.state, deployStarted: true }),
    });
  }
}

async function publishRelease(api, repo, candidate) {
  if (!candidate.state) {
    return;
  }
  if (!candidate.state.deployStarted) {
    throw new Error('デプロイ開始が記録されていません。');
  }
  // 確認済みのタイトルと本文をそのまま公開する。ノートの再生成は行わない。
  await api(`${repo}/releases/${candidate.release.id}`, 'PATCH', {
    draft: false,
    make_latest: 'true',
  });
}

/**
 * 固定したコミットのドラフト準備・承認後の検証・公開を行う。
 * API 呼び出しを差し替えることで、本番にアクセスせずに状態遷移を検証できる。
 */
export async function runRelease(command, env, api = ghApi) {
  const repo = `repos/${env.GITHUB_REPOSITORY}`;
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '')) {
    throw new Error('完全なコミット SHA が必要です。');
  }
  if (!env.GITHUB_RUN_ID) {
    throw new Error('実行 ID が必要です。');
  }
  if (command === 'prepare') {
    return prepareRelease(api, repo, env);
  }
  if (!['verify', 'publish'].includes(command)) {
    throw new Error('未対応の操作です。');
  }
  const candidate = await loadCandidate(api, repo, env);
  if (command === 'verify') {
    return verifyRelease(api, repo, candidate);
  }
  return publishRelease(api, repo, candidate);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runRelease(process.argv[2], process.env);
  if (result) {
    for (const [key, value] of Object.entries(result)) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## リリース候補\n\n- SHA: \`${result.sha}\`\n- [${result.tag}](${result.url})\n\n` +
        '内容・運用メモと品質チェック結果を確認後、production の承認を行ってください。\n',
    );
  }
}
