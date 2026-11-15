import { resolve } from 'node:path';

import type { E2eUser } from './users.ts';

/** ロール別ログイン状態（storageState）の保存先ディレクトリ */
export const AUTH_STATE_DIR = resolve(import.meta.dirname, '..', '.auth');

/**
 * 認証状態ファイルのパスを返す。
 *
 * @param key - E2E ユーザーのキー
 */
export function authStatePath(key: E2eUser['key']): string {
  return resolve(AUTH_STATE_DIR, `${key}.json`);
}
