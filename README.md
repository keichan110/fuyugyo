# Fuyugyō

スキー・スノーボードスクール 運営管理システム

## 技術スタック

- **Runtime**: Cloudflare Workers + D1 (SQLite)
- **API サーバー**: Hono
- **フロントエンド**: React 19 + TanStack Router + TanStack Query
- **言語**: TypeScript 6.0 (厳格設定)
- **ビルド**: Vite 8 + @cloudflare/vite-plugin
- **ORM**: Drizzle ORM + Drizzle Kit
- **スタイリング**: Tailwind CSS 4 + shadcn/ui
- **テスト**: Vitest + @cloudflare/vitest-pool-workers
- **開発ツール**: ESLint 9, Wrangler
- **認証**: LINE Login API, jose (JWT)
- **その他**: Zod (バリデーション), Lucide React (アイコン)
- **Node.js**: >=22.0.0

## 開発環境のセットアップ

1. 依存関係のインストール:

```bash
npm install
```

2. データベースのセットアップ:

```bash
npm run db:generate
npm run db:migrate:local
```

3. 開発サーバーの起動:

```bash
npm run dev
```

## プロジェクト構成

```
.
├── src/
│   ├── index.ts                  # Hono アプリ定義・ルートマウント
│   ├── main.tsx                  # React エントリポイント（SPA）
│   ├── routeTree.gen.ts          # TanStack Router 自動生成ルートツリー
│   ├── styles.css                # グローバルスタイル
│   ├── components/
│   │   └── ui/                   # shadcn/ui コンポーネント
│   ├── features/                 # 機能別モジュール（colocation）
│   │   ├── auth/                 # LINE 認証（API・ガード・コンポーネント）
│   │   ├── certifications/       # 資格マスタ管理
│   │   ├── departments/          # 部門管理
│   │   ├── health/               # ヘルスチェック
│   │   ├── instructors/          # インストラクター管理
│   │   ├── invitations/          # 招待システム
│   │   ├── shift-types/          # シフト種別管理
│   │   ├── shifts/               # シフト管理・表示
│   │   └── users/                # ユーザー管理
│   ├── lib/                      # 共有ライブラリ（RPC クライアント・ユーティリティ）
│   ├── routes/                   # TanStack Router ページ定義
│   └── server/                   # サーバーサイド専用コード
│       ├── auth/                 # JWT・LINE 認証・Cookie・ロール
│       ├── db/                   # Drizzle スキーマ・クライアント・エラー
│       ├── middleware/           # Hono ミドルウェア（認証・Rate Limit）
│       └── types.ts              # Cloudflare Env 型定義
├── drizzle/                      # Drizzle マイグレーション SQL
├── test/                         # 統合テスト（Vitest + Cloudflare Workers Pool）
├── public/                       # 静的アセット
├── docs/                         # プロジェクトドキュメント
├── vite.config.ts                # Vite 設定（React + TanStack Router + Cloudflare）
├── vitest.config.ts              # Vitest 設定（D1 マイグレーション付き）
├── drizzle.config.ts             # Drizzle Kit 設定
├── wrangler.toml                 # Cloudflare Workers 設定
├── tsconfig.json                 # TypeScript 設定（クライアント + サーバー）
└── tsconfig.worker.json          # TypeScript 設定（Worker 用）
```

### features ディレクトリ構成

各 feature は以下のファイルで構成される:

```
features/<name>/
├── api.ts            # Hono ルート定義（サーバーサイド）
├── schema.ts         # Zod バリデーションスキーマ
├── queries.ts        # TanStack Query フック（クライアントサイド）
└── components/       # React コンポーネント
```

## 主要機能

### 管理者機能

- **部門管理**: 部門の作成・編集・削除・有効化切り替え
- **資格マスタ管理**: 資格情報・必要資格レベル・部門関連付け
- **インストラクター管理**: 個人情報・資格情報・有効状態管理
- **シフト種別管理**: シフトの種類・時間帯・必要資格設定
- **シフト管理**: シフト作成・編集・インストラクター割り当て
- **ユーザー管理**: LINE 認証ユーザーの権限管理
- **招待管理**: 招待 URL の発行・管理

### 公開機能

- **週別・月別シフト表示**: インストラクター向け公開シフト表

### API Routes

- `/api/health` - ヘルスチェック
- `/api/auth` - LINE 認証（login, callback, logout, me）
- `/api/departments` - 部門管理 (CRUD)
- `/api/instructors` - インストラクター管理 (CRUD)
- `/api/certifications` - 資格管理 (CRUD)
- `/api/shifts` - シフト管理 (CRUD)
- `/api/shift-types` - シフト種別管理 (CRUD)
- `/api/users` - ユーザー管理 (CRUD)
- `/api/invitations` - 招待管理

## 開発用コマンド

### 必須チェック（作業前後）

```bash
npm run typecheck    # TypeScript 型チェック
npm run lint         # ESLint 静的解析
```

### 日常開発

```bash
npm run dev          # 開発サーバー起動（Vite + Wrangler）
npm run build        # プロダクションビルド（typecheck 込み）
npm run preview      # ビルド成果物のプレビュー
npm run deploy       # Cloudflare Workers へデプロイ
```

### テスト

```bash
npm test             # 全テスト実行（Vitest）
npm run test:watch   # ウォッチモード
```

### データベース操作

```bash
npm run db:generate       # Drizzle マイグレーション SQL 生成
npm run db:migrate:local  # ローカル D1 にマイグレーション適用
npm run db:migrate:remote # リモート D1 にマイグレーション適用
npm run db:studio         # Drizzle Studio 起動
```

## アーキテクチャ特徴

### SPA + API Worker 構成

- **フロントエンド**: Vite でビルドした React SPA を Cloudflare Workers の静的アセットとして配信
- **バックエンド**: Hono による API サーバーが同一 Worker 上で動作
- **ルーティング**: `/api/*` は Worker (Hono) が処理、それ以外は SPA にフォールバック

### Hono RPC

- サーバー側で定義した Hono ルートの型 (`AppType`) をクライアントから `hc<AppType>()` で型安全に呼び出し
- API スキーマの変更がクライアント側に即座に反映される

### 型安全性

- **TypeScript 厳格設定**: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes 有効
- **Zod バリデーション**: API 入力の型安全性確保
- **Drizzle ORM**: 型安全なデータベースクエリ

### Feature-based アーキテクチャ

- 各機能を `features/` 配下に colocation し、API・スキーマ・クエリ・コンポーネントをまとめて管理
- サーバーサイドコードは `server/` に集約（DB・認証・ミドルウェア）

## 詳細ドキュメント

- [CLAUDE.md](./CLAUDE.md) - AI 開発ガイダンス
- [docs/](./docs/) - 設計ドキュメント・ADR
