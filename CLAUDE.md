# プロジェクト概要

Fuyugyō - スキー・スノーボードスクールの運営管理システム。Vite + Hono (Cloudflare Workers) + TanStack Router の SPA 構成。

# 必須ルール

- Public 関数には TSDoc コメント必須
- コメントは全て日本語。複雑なロジック（複数ステップの計算・条件分岐の意図等）には付与し、自明なコードには不要
- 型アサーションは可能な限り避ける（大幅に複雑化する場合はユーザーに許可を求める）
- コロケーションの原則を遵守
- 設定ファイル（`.claude/settings.json`、`tsconfig.json`、`eslint.config.js` 等）の変更は、理由を述べユーザーの明示的承認を得てから実施

# コマンド

```bash
pnpm run dev              # 開発サーバー起動（Vite + Cloudflare Workers）
pnpm run build            # プロダクションビルド（typecheck含む）
pnpm run test             # 全テスト実行（Vitest + 実D1）

pnpm run db:generate      # Drizzle マイグレーションSQL生成（スキーマ変更時必須）
pnpm run db:migrate:local # ローカルD1にマイグレーション適用
```

- typecheck / lint / format は Stop hook・hooks で自動実行されるため手動実行不要
- 本番操作（deploy・リモートD1マイグレーション等）は Claude では実行しない

# アーキテクチャ

## サーバー/クライアント境界

- **サーバー**: Hono (Cloudflare Workers) — `src/server/` と `src/features/**/api.ts`
- **クライアント**: React SPA — `src/routes/`、`src/components/`、`src/features/**/queries.ts`
- **境界の強制**: ESLint `no-restricted-imports` でクライアントからサーバーモジュール（`api.ts`, `server/`）の値 import を禁止。`import type` のみ許可（ADR 0002）
- **RPC**: Hono RPC で型安全な API 呼び出し（`src/lib/rpc.ts`）

## プロジェクト構造

```
src/
├── index.ts          # Hono アプリ（APIルート集約 + エラーハンドラ）
├── main.tsx          # React エントリ（TanStack Router）
├── routeTree.gen.ts  # TanStack Router 自動生成（編集禁止）
├── features/[name]/  # ドメイン機能（下記「Feature 構造パターン」参照）
├── routes/           # TanStack Router ページ
├── components/ui/    # shadcn/ui コンポーネント
├── lib/              # 共有ライブラリ（rpc, query-client, utils）
└── server/           # サーバー専用（auth, db, middleware, types）
test/                 # Vitest 統合テスト（実D1使用）
drizzle/              # マイグレーションSQL
docs/                 # ADR・設計ドキュメント
```

## Feature 構造パターン

各 `src/features/[name]/`:

- `api.ts` — Hono ルート（サーバー専用、Drizzle で DB 操作）
- `schema.ts` — Zod バリデーション（サーバー・クライアント双方で使用）
- `queries.ts` — TanStack Query hooks（クライアント専用、RPC 経由）
- `components/` — 機能固有 UI

## スキーマ変更手順

`src/server/db/schema.ts` 編集 → `pnpm run db:generate` → `pnpm run db:migrate:local` → 型チェック

# コーディング規約

## 命名規則

- React コンポーネントファイル: PascalCase (`UserProfile.tsx`)
- カスタムフック: camelCase (`useUserProfile.ts`)
- その他ファイル: kebab-case
- 型名: PascalCase、プロパティ: camelCase

# Git コミット規約

## タイトル

- **Gitmoji**: 先頭に付与。コミットのたびに https://gitmoji.dev/ を参照し定義に合った絵文字を選ぶ（記憶・推測で選ばない）
- **英語命令形**、50文字以内、先頭大文字

## 本文

- **必ず日本語**（英語厳禁）
- 変更の「何を」「なぜ」を簡潔に（1-3行、複数理由は箇条書き）
