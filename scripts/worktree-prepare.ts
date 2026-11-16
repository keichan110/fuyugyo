import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { localDevPort, localE2ePort, readLocalPort } from './lib/local-ports.ts';

const root = realpathSync(process.cwd());
const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  encoding: 'utf8',
}).trim();
const lock = resolve(commonDir, 'fuyugyo-worktree-setup.lock');
const deadline = Date.now() + 30_000;

// 全 worktree で共有するロックを使い、同時作成時の二重払い出しを防ぐ。
while (true) {
  try {
    mkdirSync(lock);
    break;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    if (Date.now() >= deadline) {
      throw new Error(
        `セットアップのロック待ちがタイムアウトしました。他のセットアップ終了後、残存時のみ削除してください: ${lock}`,
      );
    }
    await setTimeout(100);
  }
}

try {
  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
  const used = new Set([5173, 5180]);
  for (const tree of worktrees) {
    if (!existsSync(tree) || realpathSync(tree) === root) continue;
    for (const file of ['.dev-port', '.e2e-port']) {
      const path = pathToFileURL(resolve(tree, file));
      if (existsSync(path)) used.add(readLocalPort(path, 0));
    }
  }
  // 既存の割り当ては維持する。旧セットアップの開発ポートも引き継ぐ。
  const isLinked = existsSync(resolve(root, '.git')) && root !== realpathSync(worktrees[0] ?? root);
  let dev = localDevPort();
  if (!existsSync('.dev-port') && isLinked) {
    dev = 5200;
    while (used.has(dev)) dev++;
  }
  let e2e = localE2ePort();
  if (!existsSync('.e2e-port') && isLinked) {
    e2e = 15200;
    while (used.has(e2e) || e2e === dev) e2e++;
  }
  // プライマリ用の既定ポートを除き、既存ファイルの衝突も見逃さない。
  const reserved = isLinked ? [] : [5173, 5180];
  if (dev === e2e || [dev, e2e].some((port) => used.has(port) && !reserved.includes(port))) {
    throw new Error(
      '他の worktree とポートが重複しています。.dev-port / .e2e-port を確認してください。',
    );
  }
  writeFileSync('.dev-port', `${dev}\n`);
  writeFileSync('.e2e-port', `${e2e}\n`);

  const primary = worktrees[0];
  for (const file of ['.env', '.dev.vars']) {
    const source = primary ? resolve(primary, file) : undefined;
    if (!existsSync(file) && source && existsSync(source)) copyFileSync(source, file);
  }
  if (!existsSync('.dev.vars')) {
    const template = readFileSync('.env.example', 'utf8')
      .replace(
        'your-super-secure-jwt-secret-at-least-32-characters-long',
        randomBytes(32).toString('hex'),
      )
      .replace('replace-with-your-line-channel-secret', 'local-line-secret-not-configured');
    // 以前の構成で .env だけに保存していた秘密値も維持し、不足する既定値だけ補う。
    const inherited = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
    const defaults = template.split('\n').filter((line) => {
      const key = /^([A-Z_][A-Z0-9_]*)=/.exec(line)?.[1];
      return !key || !new RegExp(`^${key}\\s*=`, 'm').test(inherited);
    });
    writeFileSync('.dev.vars', `${inherited}\n${defaults.join('\n')}`, { mode: 0o600 });
  }
  // Worker の設定と既存の Vite 用設定の両方で、別 worktree へのリダイレクトを防ぐ。
  for (const file of ['.env', '.dev.vars']) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    const entry = `APP_URL=http://localhost:${dev}`;
    writeFileSync(
      file,
      /^APP_URL\s*=/m.test(content)
        ? content.replace(/^APP_URL\s*=.*$/gm, entry)
        : `${content}\n${entry}\n`,
      { mode: 0o600 },
    );
  }
  console.log(`開発URL: http://localhost:${dev}\nE2E URL: http://localhost:${e2e}`);
} finally {
  rmSync(lock, { recursive: true });
}
