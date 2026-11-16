import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

/** 独立した Git リポジトリで、同時初期化・再実行・異常な設定を検証する。 */
test('worktree ごとのポートと環境変数を安全に準備する', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-worktree-'));
  const primary = join(dir, 'primary');
  mkdirSync(primary);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const prepare = (cwd) =>
    new Promise((accept, reject) => {
      const child = spawn(process.execPath, ['scripts/worktree-prepare.ts'], {
        cwd,
        stdio: 'pipe',
      });
      let output = '';
      child.stderr.on('data', (data) => {
        output += data;
      });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? accept() : reject(new Error(output))));
    });
  try {
    mkdirSync(join(primary, 'scripts/lib'), { recursive: true });
    for (const file of [
      'scripts/worktree-prepare.ts',
      'scripts/lib/local-ports.ts',
      '.env.example',
    ]) {
      cpSync(resolve(file), join(primary, file));
    }
    writeFileSync(join(primary, '.gitignore'), '.env\n.dev.vars\n.dev-port\n.e2e-port\n');
    git(primary, 'init');
    git(primary, 'add', '.');
    git(
      primary,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-m',
      'fixture',
    );
    writeFileSync(
      join(primary, '.dev.vars'),
      'JWT_SECRET=keep-this-secret\nAPP_URL=http://localhost:5173\n',
    );
    const trees = [join(dir, 'first tree'), join(dir, 'second')];
    for (const [index, tree] of trees.entries())
      git(primary, 'worktree', 'add', '-b', `test-${index}`, tree);
    await Promise.all(trees.map(prepare));
    const ports = trees.flatMap((tree) =>
      ['.dev-port', '.e2e-port'].map((file) => readFileSync(join(tree, file), 'utf8').trim()),
    );
    assert.equal(new Set(ports).size, 4);
    assert.ok(!ports.includes('5173') && !ports.includes('5180'));
    for (const tree of trees) {
      const before = readFileSync(join(tree, '.dev-port'), 'utf8');
      await prepare(tree);
      assert.equal(readFileSync(join(tree, '.dev-port'), 'utf8'), before);
      const vars = readFileSync(join(tree, '.dev.vars'), 'utf8');
      assert.ok(vars.includes('JWT_SECRET=keep-this-secret'));
      assert.ok(vars.includes(`APP_URL=http://localhost:${before.trim()}`));
    }
    rmSync(join(primary, '.dev.vars'));
    await prepare(primary);
    assert.equal(readFileSync(join(primary, '.dev-port'), 'utf8').trim(), '5173');
    assert.equal(readFileSync(join(primary, '.e2e-port'), 'utf8').trim(), '5180');
    assert.match(readFileSync(join(primary, '.dev.vars'), 'utf8'), /^JWT_SECRET=[a-f0-9]{64}$/m);
    writeFileSync(join(trees[0], '.dev-port'), 'invalid\n');
    await assert.rejects(prepare(trees[0]), /ポート設定が不正/);
    writeFileSync(join(trees[0], '.dev-port'), `${ports[2]}\n`);
    await assert.rejects(prepare(trees[0]), /ポートが重複/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
