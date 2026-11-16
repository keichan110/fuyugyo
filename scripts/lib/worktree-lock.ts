import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

/** ファイル操作のエラーコードが指定したものかを判定する。 */
function hasCode(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    codes.includes(error.code)
  );
}

/** 所有者の終了を確認できたロックだけを回収する。時刻や他ホストのPIDでは判断しない。 */
function recoverLock(lock: string): void {
  try {
    const entries = readdirSync(lock);
    if (entries.length !== 1) return;
    const name = entries[0];
    if (!name?.startsWith('owner-')) return;
    const owner: unknown = JSON.parse(readFileSync(join(lock, name), 'utf8'));
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('pid' in owner) ||
      !('host' in owner) ||
      owner.host !== hostname() ||
      typeof owner.pid !== 'number' ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0
    )
      return;
    try {
      process.kill(owner.pid, 0);
      return;
    } catch (error) {
      if (!hasCode(error, 'ESRCH')) return;
    }
    // 所有者ごとに一意なファイルだけを消す。他の回収処理が先行しても、新所有者は削除しない。
    rmSync(join(lock, name), { force: true });
    rmdirSync(lock);
  } catch (error) {
    if (!hasCode(error, 'ENOENT', 'ENOTEMPTY', 'EEXIST') && !(error instanceof SyntaxError))
      throw error;
  }
}

/**
 * worktree 共通のロックを取得し、解放関数を返す。
 * SIGINT・SIGTERM・通常終了で解放し、強制終了後は同一ホストの所有プロセスの終了を確認して回収する。
 * @param lock - 共通Gitディレクトリ内のロックパス
 * @param timeoutMs - 取得を待つ上限時間
 */
export async function acquireWorktreeLock(lock: string, timeoutMs = 30_000): Promise<() => void> {
  const token = randomUUID();
  const candidate = `${lock}.${token}`;
  const ownerName = `owner-${token}`;
  mkdirSync(candidate);
  try {
    writeFileSync(
      join(candidate, ownerName),
      JSON.stringify({ pid: process.pid, host: hostname() }),
    );
    const deadline = Date.now() + timeoutMs;
    while (true) {
      try {
        if (existsSync(lock)) {
          recoverLock(lock);
        } else {
          // 所有者情報を含む非空ディレクトリを一度に公開し、初期化途中のロックを回収させない。
          renameSync(candidate, lock);
          break;
        }
      } catch (error) {
        if (!hasCode(error, 'EEXIST', 'ENOTEMPTY')) throw error;
      }
      if (Date.now() >= deadline)
        throw new Error(`セットアップのロック待ちがタイムアウトしました: ${lock}`);
      await setTimeout(100);
    }
  } finally {
    rmSync(candidate, { recursive: true, force: true });
  }

  const release = () => {
    process.off('exit', release);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    // ロック全体の再帰削除を避け、途中で別の所有者になっていても削除しない。
    rmSync(join(lock, ownerName), { force: true });
    try {
      rmdirSync(lock);
    } catch (error) {
      if (!hasCode(error, 'ENOENT', 'ENOTEMPTY', 'EEXIST')) throw error;
    }
  };
  const interrupt = () => {
    release();
    process.exit(130);
  };
  const terminate = () => {
    release();
    process.exit(143);
  };
  process.once('exit', release);
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  return release;
}
