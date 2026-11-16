#!/usr/bin/env bash
# 新しい git worktree を作成した直後に実行するセットアップ。
# T3 Code で worktree を作成後、`pnpm run worktree:setup` を実行する。
set -euo pipefail

cd "$(dirname "$0")/.."

# ポートと環境変数を準備する。依存パッケージ不要のため install より先に実行できる。
node scripts/worktree-prepare.ts

# 初回 seed の途中で失敗しても、次回セットアップでやり直せるよう完了を記録する。
needs_seed=0
if [ ! -d .wrangler/state/v3/d1 ] || [ -f .wrangler/worktree-seed-pending ]; then
  mkdir -p .wrangler
  touch .wrangler/worktree-seed-pending
  needs_seed=1
fi

echo "▶ 依存関係をインストールしています..."
pnpm install --frozen-lockfile

echo "▶ ローカル D1 にマイグレーションを適用しています..."
pnpm run db:migrate:local

# 初回だけデモデータを投入し、再実行では既存の作業データを保持する。
if [ "$needs_seed" -eq 1 ]; then
  echo "▶ ローカル D1 が空のため初期データを投入しています..."
  pnpm run db:seed:auth
  pnpm run db:seed:demo
  rm .wrangler/worktree-seed-pending
fi

echo "✅ worktree のセットアップが完了しました"
