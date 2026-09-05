#!/usr/bin/env bash
# 新しい git worktree を作成した直後に実行するセットアップ。
# Orca の Repository → Hooks には `pnpm run worktree:setup` の 1 行だけを登録し、
# 手順の実体は git 管理下のこのスクリプトに置く（GUI 設定は再インストールで失われるため）。
set -euo pipefail

cd "$(dirname "$0")/.."

# ローカル D1 の実体が引き継がれているかをマイグレーション適用前に判定する。
# 適用すると d1 ディレクトリが作られてしまうため、この時点で記録しておく必要がある。
needs_seed=0
if [ ! -d .wrangler/state/v3/d1 ]; then
  needs_seed=1
fi

# dev サーバーのポートを worktree ごとに固定する。
# Vite の自動インクリメントに任せると起動順でポートが入れ替わり、
# ブラウザのタブが別 worktree の画面を映す事故が起きるため。
# 5173 はプライマリチェックアウト用に空けておき、worktree には 5174 以降を払い出す。
# リンク worktree では .git がファイル、プライマリチェックアウトではディレクトリになる。
if [ ! -f .dev-port ] && [ -f .git ]; then
  used=""
  while IFS= read -r line; do
    case "$line" in
      "worktree "*)
        wt="${line#worktree }"
        if [ -f "$wt/.dev-port" ]; then
          used="$used $(tr -d '[:space:]' <"$wt/.dev-port")"
        fi
        ;;
    esac
  done < <(git worktree list --porcelain)

  port=5174
  while [[ " $used " == *" $port "* ]]; do
    port=$((port + 1))
  done

  echo "$port" >.dev-port
  echo "▶ dev サーバーのポートを $port に割り当てました"
fi

echo "▶ 依存関係をインストールしています..."
pnpm install --frozen-lockfile

echo "▶ ローカル D1 にマイグレーションを適用しています..."
pnpm run db:migrate:local

# .worktreeinclude で .wrangler をコピーしている場合は既存データが残っているため
# シードは不要。コピー対象から外している場合のみ初期データを投入する。
if [ "$needs_seed" -eq 1 ]; then
  echo "▶ ローカル D1 が空のため初期データを投入しています..."
  pnpm run db:seed:auth
  pnpm run db:seed:demo
fi

echo "✅ worktree のセットアップが完了しました"
