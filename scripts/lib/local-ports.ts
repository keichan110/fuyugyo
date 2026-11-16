import { existsSync, readFileSync } from 'node:fs';

/** ローカルのポート設定を読み、未設定時は既定値を返す。不正な設定は起動前に拒否する。 */
export function readLocalPort(file: URL, fallback: number): number {
  if (!existsSync(file)) return fallback;
  const raw = readFileSync(file, 'utf8').trim();
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`ポート設定が不正です: ${file.pathname}`);
  }
  return port;
}

/** worktree の開発サーバーポートを返す。 */
export function localDevPort(): number {
  return readLocalPort(new URL('../../.dev-port', import.meta.url), 5173);
}

/** worktree の E2E サーバーポートを返す。 */
export function localE2ePort(): number {
  return readLocalPort(new URL('../../.e2e-port', import.meta.url), 5180);
}
