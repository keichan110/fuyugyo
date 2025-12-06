# Fuyugyō

スキー・スノーボードスクール 運営管理システム

## 技術スタック

- **フレームワーク**: Next.js 15.1 (App Router)
- **言語**: TypeScript 5.7 (厳格設定)
- **Runtime要件**: Node.js >=22.0.0
- **データベース**: Prisma ORM 6.2 + SQLite
- **スタイリング**: Tailwind CSS 3.4 + shadcn/ui, Radix UI
- **状態管理**: TanStack Query 5.85
- **開発ツール**: ESLint 9.17, Prettier 3.6, Jest 29.7
- **UI拡張**: Vaul（drawer），React Day Picker，Lucide React
- **その他**: Zod（バリデーション），date-fns，japanese-holidays

## 開発環境のセットアップ

1. 依存関係のインストール:

```bash
npm install
```

2. データベースのセットアップ:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

3. 開発サーバーの起動:

```bash
npm run dev
```

## プロジェクト構成

```
.
├── app/                      # Next.js App Router
│   ├── admin/                # 管理者機能
│   │   ├── shifts/           # シフト管理（作成・編集・割り当て）
│   │   ├── instructors/      # インストラクター管理
│   │   ├── certifications/   # 資格マスタ管理
│   │   └── shift-types/      # シフト種別マスタ管理
│   ├── shifts/               # 公開シフト表示機能
│   │   ├── components/       # シフト表示専用コンポーネント
│   │   ├── hooks/            # データ変換・ナビゲーション hooks
│   │   └── utils/            # 週・月計算ユーティリティ
│   ├── api/                  # API Routes (RESTful設計)
│   │   ├── departments/[id]/ # 部門CRUD
│   │   ├── instructors/[id]/ # インストラクター CRUD
│   │   ├── certifications/[id]/ # 資格 CRUD
│   │   ├── shifts/[id]/      # シフト CRUD
│   │   ├── shift-types/[id]/ # シフト種別 CRUD
│   │   ├── health/           # ヘルスチェック
│   │   └── shifts/prepare/   # シフト作成準備データ
│   ├── layout.tsx            # ルートレイアウト
│   ├── page.tsx              # ホームページ
│   └── globals.css           # グローバルスタイル
├── components/               # 再利用可能UIコンポーネント
├── features/                 # 機能別モジュール（ドメイン駆動）
├── shared/                   # 共有ユーティリティ・型定義
├── hooks/                    # カスタムフック集
├── lib/                      # ライブラリ設定・ユーティリティ
├── prisma/                   # データベーススキーマ・シード
├── docs/                     # プロジェクトドキュメント
└── public/                   # 静的アセット
```

## 主要機能

### 実装済み機能

#### 管理者機能

- **部門管理**: 部門の作成・編集・削除・有効化切り替え
- **資格マスタ管理**: 資格情報・必要資格レベル・部門関連付け
- **インストラクター管理**: 個人情報・資格情報・有効状態管理
- **シフト種別管理**: シフトの種類・時間帯・必要資格設定
- **シフト管理**: シフト作成・編集・インストラクター割り当て

#### 公開機能

- **週別シフト表示**: インストラクター向け公開シフト表
- **月間ナビゲーション**: 月・週単位での表示切り替え
- **レスポンシブ対応**: PC・タブレット・スマートフォン対応

#### API Routes (RESTful設計)

- `/api/health` - ヘルスチェック
- `/api/departments` - 部門管理 (CRUD)
- `/api/instructors` - インストラクター管理 (CRUD)
- `/api/certifications` - 資格管理 (CRUD)
- `/api/shifts` - シフト管理 (CRUD)
- `/api/shift-types` - シフト種別管理 (CRUD)
- `/api/shifts/prepare` - シフト作成準備データ

### 開発用コマンド

#### 必須チェック（作業前後）

```bash
npm run typecheck && npm run lint  # 型チェック + ESLint
```

#### 日常開発

```bash
npm run dev           # 開発サーバー起動
npm run build         # プロダクションビルド
npm run start         # 本番モードで起動
npm test              # Jest単体テスト
npm run test:watch    # テストwatchモード
npm run format        # Prettierコード整形
npm run format:check  # 整形チェック
```

#### データベース操作

```bash
npm run db:generate   # Prismaクライアント生成（スキーマ変更時必須）
npm run db:push       # スキーマをDBに反映
npm run db:studio     # Prisma Studio起動
npm run db:seed       # サンプルデータ投入（tsx実行）
```

#### 特定テスト実行

```bash
npm test -- --testPathPattern="shifts"  # 特定パス指定実行
```

## アーキテクチャ特徴

### Next.js App Router設計

- **Server Components優先**: デフォルトでServer Componentを使用
- **Client Component最小化**: `"use client"`は必要最小限に抑制
- **並列データフェッチング**: Promise.allによる効率的なデータ取得

### 型安全性・品質保証

- **TypeScript厳格設定**: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes有効
- **Zodバリデーション**: API入力・出力の型安全性確保
- **統一レスポンス形式**: `ApiResponse<T>`型による一貫したAPI設計
- **エラーハンドリング**: React Error Boundary + TanStack Query統合

### Features層アーキテクチャ

- **ドメイン駆動設計**: 機能別にapi/handlers/services/types分離
- **コンポーネント分離**: Container-Presentationalパターン採用
- **カスタムHooks**: TanStack Query統合、ロジック抽出・再利用

## 詳細ドキュメント

- [OpenAPI仕様書](./docs/openapi.yaml) - REST API仕様
- [データベース設計](./docs/db.md) - Prismaスキーマ・ER図
- [開発ガイド](./docs/nextjs.md) - Next.js実装指針
- [CLAUDE.md](./CLAUDE.md) - AI開発ガイダンス
