import { existsSync, readdirSync } from 'node:fs';

/** 開発用ローカル D1 の永続化先（wrangler 既定） */
const DEFAULT_PERSIST_DIR = '.wrangler/state';

/**
 * wrangler/miniflare が生成するローカル D1 の sqlite ファイルパスを取得する。
 * ファイル名末尾のハッシュは実行環境ごとに変わるため固定パスにできない。
 *
 * @param persistDir - 永続化先ディレクトリ。省略時は開発用の `.wrangler/state`（E2E は専用ディレクトリを渡す）
 */
export function getLocalD1Path(persistDir: string = DEFAULT_PERSIST_DIR): string {
  const dir = `${persistDir}/v3/d1/miniflare-D1DatabaseObject`;
  if (!existsSync(dir)) {
    throw new Error(`Local D1 directory not found: ${dir}. Run "pnpm run dev" first.`);
  }
  const file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!file) {
    throw new Error(`Local D1 database not found in ${dir}. Run "pnpm run dev" first.`);
  }
  return `${dir}/${file}`;
}
