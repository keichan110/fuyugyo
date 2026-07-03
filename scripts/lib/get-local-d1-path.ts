import { readdirSync } from 'node:fs';

/**
 * wrangler/miniflare が生成するローカル D1 の sqlite ファイルパスを取得する。
 * ファイル名末尾のハッシュは実行環境ごとに変わるため固定パスにできない。
 */
export function getLocalD1Path(): string {
  const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!file) {
    throw new Error(`Local D1 database not found in ${dir}. Run "pnpm run dev" first.`);
  }
  return `${dir}/${file}`;
}
