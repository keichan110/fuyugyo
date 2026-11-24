import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const marker = /<!-- fuyugyo-release:(.*?) -->/;
const notesStart = '<!-- release-notes:start -->';
const notesEnd = '<!-- release-notes:end -->';

// .github/release.yml のカテゴリ順・ラベル対応と揃える（テストで同期を検証する）。
// generate-notes は PR を最初の1カテゴリにしか載せないため、本文はここで全該当カテゴリに組み直す。
export const releaseCategories = [
  { title: '✨ 機能追加・改善', labels: ['enhancement'] },
  { title: '🐛 バグ修正', labels: ['bug'] },
  { title: '🔒 セキュリティ', labels: ['security'] },
  { title: '🗃️ DB マイグレーションあり', labels: ['db-migration'], database: true },
  { title: '⬆️ 依存関係の更新', labels: ['dependencies'] },
  { title: '🔧 CI・運用', labels: ['ci-cd', 'devops'] },
];
export const otherCategoryTitle = 'その他の変更';
const excludedLabel = 'skip-changelog';
const databaseDir = 'drizzle/';
const statusLabels = { A: '追加', D: '削除' };

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

function localGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * generate-notes の本文を、同一リポジトリの PR 項目・保持する節・末尾の文章に分解する。
 * 箇条書き（`* ` 始まり）に続く行は同じ項目の継続として扱い、複数行のタイトルも1項目で保持する。
 * PR 項目の文言と順序は生成結果のまま使う。New Contributors 節と比較リンクは本文ごと保持する。
 * 同一リポジトリの PR を指すのに分類できない項目は、黙って落とさず例外にする。
 */
function parseGenerated(body, repository) {
  const pullUrl = `https://github\\.com/${escapeRegExp(repository)}/pull/(\\d+)`;
  const prPattern = new RegExp(`^\\* [\\s\\S]+ in ${pullUrl}$`, 'i');
  const mentionsPull = new RegExp(pullUrl, 'i');
  const sections = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('## ') || sections.length === 0) {
      sections.push({ heading: line.startsWith('## ') ? line : undefined, lines: [] });
    }
    sections.at(-1).lines.push(line);
  }
  const pulls = new Map();
  const foreign = [];
  const kept = [];
  const trailer = [];
  const unclassifiable = (text) => {
    throw new Error(`generate-notes の PR 項目を分類できません。\n${text}`);
  };
  for (const section of sections) {
    if (section.heading && /^## New Contributors/i.test(section.heading)) {
      kept.push(section.lines.join('\n').trim());
      continue;
    }
    let current;
    const flush = () => {
      if (!current) {
        return;
      }
      const item = current.join('\n');
      current = undefined;
      const match = prPattern.exec(item);
      if (match) {
        pulls.set(Number(match[1]), item);
      } else if (mentionsPull.test(item)) {
        unclassifiable(item);
      } else {
        // 他リポジトリの項目などは分類できないため、その他の変更へそのまま載せる。
        foreign.push(item);
      }
    };
    for (const [index, line] of section.lines.entries()) {
      const text = line.trimEnd();
      if (section.heading && index === 0) {
        continue;
      }
      if (text.startsWith('* ')) {
        flush();
        current = [text];
      } else if (current && text.trim() && !text.startsWith('**Full Changelog**')) {
        current.push(text);
      } else {
        flush();
        if (text.trim()) {
          if (mentionsPull.test(text)) {
            unclassifiable(text);
          }
          trailer.push(text);
        }
      }
    }
    flush();
  }
  return { pulls, foreign, kept, trailer };
}

/**
 * 初回リリースの比較元。generate-notes が比較リンク（compare/<base>...<head>）で
 * 示した場合だけ、その参照を返す。
 */
function generatedBase(body) {
  const link = /\*\*Full Changelog\*\*:\s*(\S+)/.exec(body)?.[1];
  const compare = link && /\/compare\/(.+?)\.\.\.(.+)$/.exec(link);
  return compare ? decodeURIComponent(compare[1]) : undefined;
}

function resolveCommit(git, ref) {
  try {
    const resolved = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // 下の共通エラーにまとめる。
  }
  throw new Error(`比較元 ${ref} を Git 履歴から解決できません。`);
}

/**
 * 比較範囲を rev-list の引数で返す。公開済みタグがあればそのタグから候補 SHA まで、
 * 初回は generate-notes の比較元、それもなければ候補 SHA から到達できる全履歴。
 */
function resolveRange(git, sha, latest, generatedBody) {
  const base = latest
    ? resolveCommit(git, `refs/tags/${latest.tag_name}`)
    : (() => {
        const ref = generatedBase(generatedBody);
        return ref && resolveCommit(git, ref);
      })();
  return base ? [`${base}..${sha}`] : [sha];
}

/** 2つのツリー間で変わった drizzle/ のパスと変更種別を返す。 */
function diffPaths(git, from, to) {
  const tokens = git([
    'diff-tree',
    '-r',
    '-z',
    '--name-status',
    '--no-renames',
    '--no-commit-id',
    from,
    to,
    '--',
    databaseDir,
  ])
    .split('\0')
    .filter(Boolean);
  const paths = new Map();
  // -z の name-status は「状態, パス」の組が NUL 区切りで続く。
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    paths.set(tokens[i + 1], statusLabels[tokens[i]] ?? '更新');
  }
  return paths;
}

/**
 * 比較範囲の各コミットについて drizzle/ の変更を列挙する。
 * 比較 API は変更ファイル数に上限があるため Git 履歴を使う。移動は削除と追加として扱う。
 * 通常のコミットは第1親（ルートは空ツリー）との差分を使う。マージコミットは全ての親と比較し、
 * 全親と異なる状態のパスだけを採用する。片方の親と同じパスは取り込みなので、
 * 取り込み元のコミットが範囲内の別コミットとして検出される。
 */
function listDatabaseChanges(git, range) {
  const commits = git(['rev-list', '--parents', '--reverse', ...range])
    .split('\n')
    .filter(Boolean);
  let emptyTree;
  const changes = [];
  for (const line of commits) {
    const [commit, ...parents] = line.split(' ');
    if (parents.length === 0) {
      emptyTree ??= git(['hash-object', '-t', 'tree', '/dev/null']).trim();
    }
    const diffs = (parents.length > 0 ? parents : [emptyTree]).map((parent) =>
      diffPaths(git, parent, commit),
    );
    const files = [...diffs[0]]
      .filter(([path]) => diffs.every((diff) => diff.has(path)))
      .map(([path, status]) => ({ status, path }));
    if (files.length > 0) {
      changes.push({ commit, files, merge: parents.length > 1 });
    }
  }
  return changes;
}

/** 通常一覧の PR について、ラベル・マージ状態・base リポジトリを PR の詳細から取得する。 */
async function loadPulls(api, repo, repository, numbers) {
  const pulls = new Map();
  for (const number of numbers) {
    const pull = await api(`${repo}/pulls/${number}`);
    pulls.set(number, {
      labels: new Set(pull.labels.map((label) => label.name)),
      merged: Boolean(pull.merged_at),
      sameRepository: pull.base?.repo?.full_name?.toLowerCase() === repository.toLowerCase(),
    });
  }
  return pulls;
}

/**
 * 候補 SHA のリリースノートを組み立てる。generate-notes の PR 行を通常一覧とし、
 * PR のラベルで全該当カテゴリに再分類したうえで、Git 履歴から検出した drizzle/ の変更を
 * DB カテゴリへ補う。取得に失敗した場合は例外を投げ、ドラフトを保存させない。
 */
async function buildNotes({ api, git, repo, repository, sha, latest, generated }) {
  const parsed = parseGenerated(generated, repository);
  const details = await loadPulls(api, repo, repository, [...parsed.pulls.keys()]);
  const labels = new Map([...details].map(([number, pull]) => [number, pull.labels]));
  const listed = new Map(
    [...parsed.pulls].filter(([number]) => !labels.get(number).has(excludedLabel)),
  );

  const databasePulls = new Set(
    [...listed.keys()].filter((number) => labels.get(number).has('db-migration')),
  );
  const direct = [];
  for (const change of listDatabaseChanges(git, resolveRange(git, sha, latest, generated))) {
    // マージコミットの変更は競合解決などで生じたもので、関連 PR に帰属させずコミットとして示す。
    if (change.merge) {
      direct.push(change);
      continue;
    }
    // 関連 API の一覧は候補の照合にだけ使い、マージ済みか同一リポジトリかは PR の詳細で確認する。
    const related = await listAll(api, `${repo}/commits/${change.commit}/pulls`);
    const mapped = related.filter((pull) => {
      const detail = details.get(pull.number);
      return listed.has(pull.number) && detail.merged && detail.sameRepository;
    });
    if (mapped.length > 0) {
      mapped.forEach((pull) => databasePulls.add(pull.number));
    } else {
      direct.push(change);
    }
  }

  const sections = releaseCategories.map((category) => ({ title: category.title, lines: [] }));
  const other = { title: otherCategoryTitle, lines: [] };
  for (const [number, line] of listed) {
    const matched = releaseCategories.flatMap((category, index) =>
      category.labels.some((label) => labels.get(number).has(label)) ||
      (category.database && databasePulls.has(number))
        ? [index]
        : [],
    );
    (matched.length > 0 ? matched.map((index) => sections[index]) : [other]).forEach((section) =>
      section.lines.push(line),
    );
  }
  const database = sections[releaseCategories.findIndex((category) => category.database)];
  for (const { commit, files } of direct) {
    const paths = files.map((file) => `\`${file.path}\`（${file.status}）`).join('、');
    database.lines.push(
      `* [\`${commit.slice(0, 7)}\`](https://github.com/${repository}/commit/${commit}) ${paths}`,
    );
  }
  other.lines.push(...parsed.foreign);

  return [
    ...[...sections, other]
      .filter((section) => section.lines.length > 0)
      .map((section) => `## ${section.title}\n${section.lines.join('\n')}`),
    ...parsed.kept,
    parsed.trailer.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
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

async function saveDraft(api, git, repo, env, draft, latest, tag) {
  const sha = env.RELEASE_SHA;
  const previous = draft && metadata(draft);
  let notes;
  if (!draft || previous.sha !== sha) {
    const generated = await api(`${repo}/releases/generate-notes`, 'POST', {
      tag_name: tag,
      target_commitish: sha,
      ...(latest ? { previous_tag_name: latest.tag_name } : {}),
    });
    notes = await buildNotes({
      api,
      git,
      repo,
      repository: env.GITHUB_REPOSITORY,
      sha,
      latest,
      generated: generated.body,
    });
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

async function prepareRelease(api, git, repo, env) {
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
  return saveDraft(api, git, repo, env, draft, latest, tag);
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

// タグ未作成のドラフトは tag_name を省いて更新すると GitHub が untagged-* に置き換えるため、毎回指定する。
function pinnedTarget(release) {
  return { tag_name: release.tag_name, target_commitish: release.target_commitish };
}

async function verifyRelease(api, repo, candidate) {
  await assertApproval(api, repo);
  if (candidate.state) {
    await api(`${repo}/releases/${candidate.release.id}`, 'PATCH', {
      ...pinnedTarget(candidate.release),
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
    ...pinnedTarget(candidate.release),
    draft: false,
    make_latest: 'true',
  });
}

/**
 * 固定したコミットのドラフト準備・承認後の検証・公開を行う。
 * API 呼び出しと Git 実行を差し替えることで、本番にアクセスせずに状態遷移を検証できる。
 */
export async function runRelease(command, env, api = ghApi, git = localGit) {
  const repo = `repos/${env.GITHUB_REPOSITORY}`;
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '')) {
    throw new Error('完全なコミット SHA が必要です。');
  }
  if (!env.GITHUB_RUN_ID) {
    throw new Error('実行 ID が必要です。');
  }
  if (command === 'prepare') {
    return prepareRelease(api, git, repo, env);
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
