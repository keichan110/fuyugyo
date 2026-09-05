import { readFileSync } from 'node:fs';

import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * dev サーバーのポート番号を解決する。
 *
 * worktree ごとの固定ポートは `scripts/worktree-setup.sh` が `.dev-port` に払い出す。
 * ファイルが無いプライマリチェックアウトでは Vite 既定の 5173 を使う。
 */
function resolveDevPort(): number {
  try {
    const raw = readFileSync(new URL('./.dev-port', import.meta.url), 'utf8');
    const port = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(port) ? port : 5173;
  } catch {
    return 5173;
  }
}

export default defineConfig({
  server: {
    port: resolveDevPort(),
    // 自動で別ポートに退避すると worktree とポートの対応が崩れ、
    // ブラウザで別 worktree の画面を見てしまうため、衝突時は起動を失敗させる
    strictPort: true,
  },
  plugins: [
    // tanstackRouter は react プラグインより前に置く必要がある
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
