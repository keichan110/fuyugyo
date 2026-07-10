# プロジェクト概要

Fuyugyō - スキー・スノーボードスクールの運営管理システム。Vite + Hono (Cloudflare Workers) + TanStack Router の SPA 構成。

# 必須ルール

- Public 関数には TSDoc 形式のコメントを必須とする
- **コメント戦略**:
  - ロジック的に複雑な部分には適切にコメントを入れる（例：複数ステップの計算、条件分岐の意図など）
  - **自明なコードにはコメントは不要**（例：変数代入、単純なループ）
  - **全てのコメントは日本語で記載**する
- 型アサーションは可能な限り避ける（実装が大幅に複雑になる場合などはユーザーに許可を求める）
- コロケーションの原則を遵守する
- **設定ファイル系の変更は厳格に管理**: `.claude/settings.json`、`tsconfig.json`、`eslint.config.js` など設定ファイルへの変更は、**必ず変更の理由を述べた上でユーザーの明示的な承認を得てから実施**する。承認なしの変更は厳禁

# コマンド

## 日常開発

```bash
pnpm run dev          # 開発サーバー起動（Vite + Cloudflare Workers）
pnpm run build        # プロダクションビルド（typecheck含む）
pnpm run preview      # ビルド結果のプレビュー
pnpm run deploy       # ビルド + Cloudflare Workers デプロイ
pnpm run typecheck    # TypeScript型チェック（Stop hookで自動実行されるため手動不要）
pnpm run lint         # ESLint静的解析（Stop hookで自動実行されるため手動不要）
pnpm run format       # Prettier コード整形（hooks で自動実行されるため手動不要）
pnpm run format:check # Prettier 整形チェック
```

## データベース操作

```bash
pnpm run db:generate      # Drizzle マイグレーションSQL生成（スキーマ変更時必須）
pnpm run db:migrate:local # ローカルD1にマイグレーション適用
pnpm run db:migrate:remote # リモートD1にマイグレーション適用
pnpm run db:studio        # Drizzle Studio起動
```

## テスト

```bash
pnpm run test        # 全テスト実行（Vitest + 実D1）
pnpm run test:watch  # ウォッチモード
```

# アーキテクチャ

## サーバー/クライアント境界

- **サーバー**: Hono (Cloudflare Workers) — `src/server/` と `src/features/**/api.ts`
- **クライアント**: React SPA — `src/routes/`、`src/components/`、`src/features/**/queries.ts`
- **境界の強制**: ESLint `no-restricted-imports` でクライアントからサーバーモジュール（`api.ts`, `server/`）の値 import を禁止。`import type` のみ許可（ADR 0002）
- **RPC**: Hono RPC で型安全な API 呼び出し（`src/lib/rpc.ts`）

## プロジェクト構造

```
src/
├── index.ts               # Hono アプリ（APIルート集約 + エラーハンドラ）
├── main.tsx               # React エントリ（TanStack Router）
├── routeTree.gen.ts       # TanStack Router 自動生成（編集禁止）
├── styles.css             # グローバルスタイル
├── features/              # ドメイン機能（colocation）
│   └── [feature]/
│       ├── api.ts         # Hono ルート定義（サーバー専用）
│       ├── schema.ts      # Zod スキーマ（isomorphic）
│       ├── queries.ts     # TanStack Query hooks（クライアント専用）
│       └── components/    # 機能固有UIコンポーネント
├── routes/                # TanStack Router ページ
├── components/ui/         # shadcn/ui コンポーネント
├── lib/                   # 共有ライブラリ（rpc, query-client, utils）
└── server/                # サーバー専用コード
    ├── auth/              # 認証（JWT, LINE, Cookie, ロール）
    ├── db/                # Drizzle クライアント・スキーマ・エラー
    ├── middleware/         # Hono ミドルウェア
    └── types.ts           # Worker Bindings 型

test/                      # Vitest 統合テスト（実D1使用）
drizzle/                   # マイグレーションSQL
docs/                      # ADR・設計ドキュメント
```

## データベーススキーマ変更時

1. `src/server/db/schema.ts` を編集
2. `pnpm run db:generate` — マイグレーション SQL 生成
3. `pnpm run db:migrate:local` — ローカル D1 に適用
4. `pnpm run typecheck` — 型チェック

# コーディング規約

## 命名規則

- React コンポーネントファイル: PascalCase (`UserProfile.tsx`)
- カスタムフック: camelCase (`useUserProfile.ts`)
- それ以外のファイル: kebab-case
- コンポーネント名: PascalCase、フック名: camelCase、型名: PascalCase、プロパティ: camelCase

## Feature の構造パターン

各 `src/features/[name]/` は以下の構造を持つ:

- `api.ts` — Hono ルート（サーバー専用、Drizzle で DB 操作）
- `schema.ts` — Zod バリデーション（サーバー・クライアント双方で使用）
- `queries.ts` — TanStack Query hooks（クライアント専用、RPC 経由で API 呼び出し）
- `components/` — 機能固有の UI コンポーネント

# 開発ワークフロー

## Git コミット規約

### コミットタイトル

- **Gitmoji**: コミットメッセージの先頭に Gitmoji を付与
  - **コミットのたびに必ず https://gitmoji.dev/ を参照し、定義に合った絵文字を選択すること**（記憶や推測で選ばない）
- **英語命令形**: タイトルは英語で簡潔に（50文字以内）
- **先頭は大文字**: タイトルの最初の単語は大文字で始める

### コミット本文

- **必須言語は日本語**: 本文は**必ず日本語**で記載（英語は厳禁）
- **簡潔性を重視**: 変更理由を簡潔に（1-3行程度、72文字幅目安）
- **箇条書き形式**: 複数の理由がある場合は箇条書きで記載
- **具体的に**: 「何を」「なぜ」を明確に記載

## 作業完了時チェックリスト

- [ ] typecheck / lint は Stop hook で自動チェックされる（失敗時は自動でフィードバックが返り修正ループに入る）
- [ ] 関連テスト通過確認
- [ ] Gitmoji コミットメッセージ作成
