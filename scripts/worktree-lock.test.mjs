import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acquireWorktreeLock } from './lib/worktree-lock.ts';

/** 子プロセスにロックを保持させ、終了シグナルによる解放と回収を検証する。 */
for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
  test(`${signal} 後に他のセットアップがロックを取得できる`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-lock-'));
    const lock = join(dir, 'setup.lock');
    const holder = join(dir, 'holder.mjs');
    writeFileSync(
      holder,
      `
      import { acquireWorktreeLock } from ${JSON.stringify(new URL('./lib/worktree-lock.ts', import.meta.url).href)};
      await acquireWorktreeLock(process.argv[2]);
      process.send('ready');
      setInterval(() => {}, 1000);
    `,
    );
    const child = fork(holder, [lock], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    try {
      const ready = once(child, 'message');
      await Promise.race([
        ready,
        once(child, 'exit').then(() => {
          throw new Error('ロック取得前に子プロセスが終了しました');
        }),
      ]);
      assert.equal(readdirSync(lock).length, 1);
      const exited = once(child, 'exit');
      child.kill(signal);
      await exited;
      assert.equal(existsSync(lock), signal === 'SIGKILL');
      // 複数の回収者が同時に動いても、同時に所有者になることがない。
      let active = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          const release = await acquireWorktreeLock(lock, 3000);
          try {
            active++;
            assert.equal(active, 1);
            await new Promise((accept) => setTimeout(accept, 10));
          } finally {
            active--;
            release();
          }
        }),
      );
      assert.equal(existsSync(lock), false);
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('生存中の所有者からロックを奪わず、解放は再実行できる', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-lock-'));
  const lock = join(dir, 'setup.lock');
  const release = await acquireWorktreeLock(lock);
  try {
    await assert.rejects(acquireWorktreeLock(lock, 50), /タイムアウト/);
    assert.equal(existsSync(lock), true);
    assert.equal(readdirSync(dir).length, 1);
    release();
    const nextRelease = await acquireWorktreeLock(lock);
    release();
    assert.equal(existsSync(lock), true);
    nextRelease();
    release();
    assert.equal(existsSync(lock), false);
  } finally {
    release();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('外部でロックが削除されても解放はエラーにならない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-lock-'));
  const lock = join(dir, 'setup.lock');
  const release = await acquireWorktreeLock(lock);
  try {
    rmSync(lock, { recursive: true });
    assert.doesNotThrow(release);
  } finally {
    release();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('所有者不明のロックを自動で上書きしない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-lock-'));
  const lock = join(dir, 'setup.lock');
  mkdirSync(lock);
  try {
    await assert.rejects(acquireWorktreeLock(lock, 50), /タイムアウト/);
    assert.equal(existsSync(lock), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
