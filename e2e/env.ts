import { localE2ePort } from '../scripts/lib/local-ports.ts';

/**
 * E2E 実行で共有する定数の単一の出所。
 * playwright.config.ts・prepare.ts・global-setup.ts・seed がここを参照する。
 */

/** E2E 専用の dev サーバーポート（開発用の 5173 と同時起動できるよう分離） */
export const E2E_PORT = localE2ePort();

/** E2E 専用のローカル D1 永続化先。開発用の `.wrangler/state` とは別ディレクトリ */
export const E2E_PERSIST_DIR = '.wrangler/e2e-state';

/** E2E 専用の JWT 署名シークレット。本番・Vitest のものとは別の、明らかにダミーな固定値 */
export const E2E_JWT_SECRET = 'e2e-dummy-jwt-secret-not-for-production-0123456789';

/** E2E の JWT 有効期限。実行中に切れない長さにする */
export const E2E_JWT_EXPIRES_IN = '1d';

/** E2E 対象アプリのベース URL */
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * ブラウザ時計の固定時刻（2026-01-15 木曜 JST 朝）。
 * `page.clock` で固定されるのはブラウザ側のみで、サーバーの `new Date()` は固定されない。
 */
export const E2E_FIXED_NOW = '2026-01-15T09:00:00+09:00';
