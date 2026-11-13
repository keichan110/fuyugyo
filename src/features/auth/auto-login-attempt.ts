import { z } from 'zod';

import type { LoginSearch } from './login-policy';

/** OAuth 往復をまたいでタブ単位の試行と再試行情報を保持するキー */
const AUTO_LOGIN_ATTEMPT_KEY = 'fuyugyo:auto-login-attempt';

const attemptSchema = z.object({ redirect: z.string().optional(), invite: z.string().optional() });

type AttemptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** ブラウザ以外の実行環境でも安全にストレージの形を確認する */
function isAttemptStorage(value: unknown): value is AttemptStorage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getItem' in value &&
    typeof value.getItem === 'function' &&
    'setItem' in value &&
    typeof value.setItem === 'function' &&
    'removeItem' in value &&
    typeof value.removeItem === 'function'
  );
}

/** ブラウザの設定によってプロパティの取得自体が拒否される場合も扱う */
function getStorage(): AttemptStorage | null {
  try {
    const storage = 'sessionStorage' in globalThis ? globalThis.sessionStorage : null;
    return isAttemptStorage(storage) ? storage : null;
  } catch {
    return null;
  }
}

/** 認証が確認できていない自動ログインの情報を返す。壊れた記録でも再試行を抑止する */
export function readAutoLoginAttempt(): LoginSearch | null {
  try {
    const raw = getStorage()?.getItem(AUTO_LOGIN_ATTEMPT_KEY);
    if (raw == null) return null;
    const parsed = attemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** 自動ログイン開始前に試行情報を保存する。保存できなければ自動遷移を開始しない */
export function saveAutoLoginAttempt(search: LoginSearch): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    const raw = JSON.stringify(attemptSchema.parse(search));
    storage.setItem(AUTO_LOGIN_ATTEMPT_KEY, raw);
    return storage.getItem(AUTO_LOGIN_ATTEMPT_KEY) === raw;
  } catch {
    return false;
  }
}

/** 本人確認に成功したら試行情報を消し、次回のセッション切れで自動ログインを許可する */
export function clearAutoLoginAttempt(): void {
  try {
    getStorage()?.removeItem(AUTO_LOGIN_ATTEMPT_KEY);
  } catch {
    // ストレージを利用できなくても認証済みのアプリ利用は継続する。
  }
}
