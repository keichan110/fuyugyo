# プロジェクト概要

Fuyugyō - スキー・スノーボードスクールの運営管理システム。Vite + Hono (Cloudflare Workers) + TanStack Router の SPA 構成。

# 必須ルール

- Public 関数には TSDoc コメント必須
- コメントは全て日本語。複雑なロジック（複数ステップの計算・条件分岐の意図等）には付与し、自明なコードには不要
- 型アサーションは可能な限り避ける（大幅に複雑化する場合はユーザーに許可を求める）
- コロケーションの原則を遵守
- `src/routeTree.gen.ts` は TanStack Router の自動生成ファイルのため編集禁止
- 設定ファイル（`.claude/settings.json`、`.codex/hooks.json`、`tsconfig.json`、`eslint.config.js` 等）の変更は、理由を述べユーザーの明示的承認を得てから実施

# コマンド

```bash
pnpm run dev              # 開発サーバー起動（Vite + Cloudflare Workers）
pnpm run build            # プロダクションビルド（typecheck含む）
pnpm run test             # 全テスト実行（Vitest + 実D1）

pnpm run test:e2e:smoke   # E2E スモーク（開発サーバー・Chromium、@smoke タグのみ。PR の CI と同じ）
pnpm run test:e2e         # フル E2E（build → ビルド済み Worker で Chromium + モバイル WebKit。リリースゲートと同じ）

pnpm run db:generate      # Drizzle マイグレーションSQL生成（スキーマ変更時必須）
pnpm run db:migrate:local # ローカルD1にマイグレーション適用
```

- typecheck / lint / format は Stop hook（Claude Code・Codex 共通の `scripts/quality-check.sh`）で自動実行されるため手動実行不要
- 本番操作（deploy・リモートD1マイグレーション等）は AI エージェントでは実行しない

## E2E（Playwright）

- 初回はブラウザの導入が必要: `pnpm exec playwright install chromium webkit`（スモークだけなら `chromium` のみ）
- テストは `e2e/**/*.e2e.ts`。スモーク対象には `test()` のオプションで `{ tag: '@smoke' }` を付ける
- 実行のたびに E2E 専用のローカル D1（`.wrangler/e2e-state`）を作り直して seed を投入する。開発用 D1 には影響しない
- ポートは `.e2e-port`（未設定時は 5180）を使い、サーバーを常に新規起動する（既存サーバーは再利用しない）。ポートが使用中だと失敗する

# アーキテクチャ

## サーバー/クライアント境界

- **サーバー**: Hono (Cloudflare Workers) — `src/server/` と `src/features/**/api.ts`
- **クライアント**: React SPA — `src/routes/`、`src/components/`、`src/features/**/queries.ts`
- **境界の強制**: ESLint `no-restricted-imports` でクライアントからサーバーモジュール（`api.ts`, `server/`）の値 import を禁止。`import type` のみ許可
- **RPC**: Hono RPC で型安全な API 呼び出し（`src/lib/rpc.ts`）

## Feature 構造パターン

各 `src/features/[name]/`:

- `api.ts` — Hono ルート（サーバー専用、Drizzle で DB 操作）
- `schema.ts` — Zod バリデーション（サーバー・クライアント双方で使用）
- `queries.ts` — TanStack Query hooks（クライアント専用、RPC 経由）
- `components/` — 機能固有 UI

共通 UI は `src/components/` に置き、Mantine の部品は直接使わず `AppButton` などの `App*` ラッパーを優先する。

## スキーマ変更手順

`src/server/db/schema.ts` 編集 → `pnpm run db:generate` → `pnpm run db:migrate:local` → 型チェック

## 設計方針

- **API レスポンス**: 成功は `c.json(data)` で生データと HTTP ステータスを返す。失敗は `HTTPException` を投げ、中央の `onError`（`src/index.ts`）で整形する。`{ success, data }` のようなエンベロープは使わない
- **DB 書き込み**: 複数行の原子的な書き込みは `db.batch([...])` で行う（D1 はインタラクティブトランザクション非対応）。read-then-write のレースはアプリ側の事前チェックに頼らず、ユニーク制約と `ON CONFLICT` に寄せる。ID は `crypto.randomUUID()`
- **認証**: ステートレス JWT（ロールは JWT クレームで保持）。KV セッションは使わない。Rate Limit は未認証で到達できる認証系エンドポイントにのみ適用し、認証済み API には適用しない
- **部門**: `DepartmentCode` はコード側の固定語彙。DB に FK・CHECK 制約は置かず、API 境界の `z.enum` で整合性を担保する。部門ごとの表示設定は `Record<DepartmentCode, ...>` の全域マップで持ち、部門追加時の設定漏れを型で検出する
- **シフト**: Shift の明示的な作成・削除 API は作らない。`(date, departmentCode, shiftTypeId)` 単位で割り当て集合を丸ごと upsert し、割り当てが0件で備考もなければ Shift を削除する。必要人数は Shift とは別テーブルに保存する（意味は `CONTEXT.md` 参照）
- **テスト**: 実 D1 の統合テストを主役にし、純粋関数のユニットテストはロジックが濃い所に絞る。型で保証される部分（RPC・Drizzle の型）はテストしない。E2E は主要業務のハッピーパスと重大な禁止操作に限る
- **見送った設計**: Cache API による共有 read キャッシュは、認可・鮮度・キャッシュ汚染の安全性担保が重いため採用していない

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

# PR 規約

- **タイトルは日本語**（Gitmoji なし。例: `スキー場の天気予報をシフト画面に表示する`）。リリースノートにそのまま載るため、読んで変更内容がわかる表現にする
- **作成時に種別ラベルを1つ付ける**（`enhancement` / `bug` / `security` / `ci-cd`）。リリースノートの分類に使う（`.github/release.yml`）
- `db-migration` は `drizzle/` の変更から自動で付く。`dependencies` は Renovate が付ける
