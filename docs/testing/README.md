# テスト方針

## 構成

| 種別                   | ツール                                             | 対象                           | 場所    |
| ---------------------- | -------------------------------------------------- | ------------------------------ | ------- |
| 統合テスト・単体テスト | Vitest（`@cloudflare/vitest-pool-workers`、実 D1） | API・ドメインロジック          | `test/` |
| E2E テスト             | Playwright                                         | ブラウザから見た主要な業務導線 | `e2e/`  |

- 認証・権限・API の振る舞いは Vitest の統合テストで担保する。
- E2E は「壊れたらスクール業務が止まる導線」に絞る。LINE OAuth のログインフロー自体は E2E の対象外（統合テストで担保）。
- Vitest は `test/**/*.{test,spec}.ts` だけを拾う。E2E は `e2e/**/*.e2e.ts` で、互いに衝突しない。
- 重要シナリオごとの既存テスト・不足・PR／リリースでの実行範囲、カバレッジの基準値は [テスト品質ベースライン](./quality-baseline.md) にまとめている。

## E2E の実行

```bash
# 初回のみ: ブラウザを取得する（スモークだけなら chromium のみ）
pnpm exec playwright install chromium webkit

# スモーク（@smoke タグ付きのみ。開発サーバー・Chromium）
pnpm run test:e2e:smoke

# 全シナリオ（production build → ビルド済み Worker。Chromium とモバイル WebKit）
pnpm run test:e2e

# ビルド済みの dist/ を再ビルドせずに全シナリオを実行（リリースの入口。事前に pnpm run build が必要）
pnpm run test:e2e:release
```

どのコマンドも「E2E 用 D1 の作り直し → seed → サーバー起動 → テスト実行」まで行う。スモークは開発サーバー（`pnpm run dev`）、全シナリオは `e2e/serve-built.ts` が配信するビルド済み Worker に対して実行する。

### 実行の流れ

1. `e2e/prepare.ts`: `.wrangler/e2e-state` を削除し、E2E 用の環境変数ファイル（`.dev.vars.e2e`）を生成、マイグレーションを適用して seed を投入する。
2. Playwright の `webServer`: スモークは `pnpm run dev`、全シナリオ（`E2E_BUILT=1`）は `pnpm exec tsx e2e/serve-built.ts` を起動する（常に新規起動。実行中サーバーの D1 を消さないため `reuseExistingServer: false`）。
3. `e2e/global-setup.ts`: seed ユーザーごとに JWT を署名し、ロール別の `storageState` を `e2e/.auth/` に保存する。
4. `e2e/smoke/*.e2e.ts`（`@smoke` タグ付き）と `e2e/full/*.e2e.ts`: テスト本体。`@smoke` を持たないテストは全シナリオの実行でだけ動く。ブラウザは通常 `mobile-chromium`（Pixel 7）で、全シナリオでは `mobile-webkit`（iPhone 13）も加わる。

### ディレクトリ構成

```
e2e/
├── env.ts              # ポート・永続化先・JWT シークレット・固定時刻など E2E 定数の単一の出所
├── prepare.ts          # Playwright 起動前の準備（D1 再作成・環境変数生成・seed）
├── seed.ts             # 決定的な最小業務データ（固定 ID・冪等）
├── serve-built.ts      # ビルド済み Worker・静的アセットの配信（全シナリオ用）
├── global-setup.ts     # storageState 生成
├── fixtures/
│   ├── users.ts        # E2E ユーザー定義（seed と global-setup の共通の出所）
│   ├── auth-state.ts   # storageState のパス
│   ├── business-data.ts / business-date.ts / network.ts  # 業務テスト用のデータ初期化・日付・外部通信の遮断
│   └── test.ts         # ブラウザ時計を固定した拡張 test
├── smoke/              # PR で実行する @smoke タグ付きのスモークテスト
└── full/               # 全シナリオ（リリースのゲート）でだけ実行する業務・権限テスト
```

セレクタはロール・ラベル・テキストで書き、`data-testid` などの E2E 専用属性は本番コードに入れない。

## seed ユーザー

定義は [`e2e/fixtures/users.ts`](../../e2e/fixtures/users.ts) が唯一の出所。

| key        | lineUserId     | ロール  | 有効                                 |
| ---------- | -------------- | ------- | ------------------------------------ |
| `admin`    | `e2e-admin`    | ADMIN   | はい                                 |
| `manager`  | `e2e-manager`  | MANAGER | はい                                 |
| `member`   | `e2e-member`   | MEMBER  | はい                                 |
| `inactive` | `e2e-inactive` | MEMBER  | いいえ（インストラクター紐付けなし） |

業務データ（インストラクター、シフト種類、2026-01-15〜18 のシフト）は [`e2e/seed.ts`](../../e2e/seed.ts)。乱数・現在日時に依存せず、全行に固定 ID を使うため、何度流しても同じ結果になる。開発用の `db:seed:demo` は手動確認用で、E2E には使わない。

## ログイン状態の作り方

本番に検証用ログインの口は開けない。代わりに、認証がステートレス JWT（`requireAuth` は DB を参照しない）であることを使い、統合テストと同じ方式でログイン状態を作る。

- `global-setup.ts` が、アプリ本体の `signJwt`（`src/server/auth/jwt.ts`）を import して、E2E 専用の固定 `JWT_SECRET` で署名する（署名処理は複製しない）。
- 署名したトークンを `auth-token` Cookie（`AUTH_COOKIE`）に載せた `storageState` を `e2e/.auth/{admin,manager,member,inactive}.json` に保存する。
- テストは `test.use({ storageState: authStatePath('admin') })` のようにロールを選ぶ。
- E2E 用の `JWT_SECRET` は本番・Vitest のものと別の明らかなダミー値で、`e2e/env.ts` に置く。

`playwright.config.ts` は baseURL が `localhost` / `127.0.0.1` 以外だと読み込み時に例外を投げる（本番への誤爆防止）。

## 開発環境との分離

- **ポート**: E2E の dev サーバーは `5180`。通常の開発サーバー（5173）と同時に起動できる。`E2E_PORT` を設定すると `vite.config.ts` が `.dev-port` より優先して使う。
- **D1**: `.wrangler/e2e-state` に分離する。`E2E_PERSIST_DIR` を設定すると `vite.config.ts` が `@cloudflare/vite-plugin` の `persistState` に渡す。開発用の `.wrangler/state` には触れない。seed は書き込み先が E2E 用ディレクトリ外だと例外で止まる。
- **環境変数**: `CLOUDFLARE_ENV=e2e` で起動すると、vite-plugin は `.dev.vars.e2e` だけを読み、`.dev.vars` と `.env` は読まない。`wrangler.toml` に `[env.e2e]` は無いため「環境 e2e の設定が見つからない」旨の警告が出るが、トップレベルの設定が使われるので想定内。`.dev.vars.e2e` は `prepare.ts` が毎回生成する（`.gitignore` 済み）。
- **Sentry**: サーバー側は `.dev.vars.e2e` の `SENTRY_DSN=`（空）で、クライアント側は webServer の `VITE_SENTRY_DSN=''` で無効化する。E2E から Sentry へは送信されない。

## 時計の固定

`e2e/fixtures/test.ts` の拡張 test が `page.clock.setFixedTime` でブラウザ時計を 2026-01-15（木）朝 JST に固定する。ダッシュボードの見出しや「このあと」など、クライアントの今日に依存する表示が決定的になる。

固定されるのはブラウザの `Date` だけで、サーバーの `new Date()` は固定されない。スモークでは、サーバー時刻に依存する表示（`/me/season-stats` など）は検証しない。

## `@smoke` タグ

各スモークテストは `{ tag: '@smoke' }` を付ける。`test:e2e:smoke` は `--grep @smoke` で絞り込み、目安は 2〜3 分以内。シナリオを増やすときも、スモークには業務が止まる導線だけを入れる。

## CI

詳細（必須チェック・失敗時の挙動・実績と未確認の区別）は [テスト品質ベースライン](./quality-baseline.md)（§4） を参照する。要点:

- **PR・main への push**（`.github/workflows/quality-check.yml`）: `static`（型・lint・format・build・audit）、`test`（Node テスト + Vitest + カバレッジ閾値）、`e2e`（`@smoke` のみ・Chromium）を別ジョブで実行する。`main` の ruleset はこの 3 ジョブを必須にしている。
- **リリース**（`.github/workflows/release.yml`、手動実行）: 採番した SHA をビルドし、そのビルド成果物に対して全シナリオの E2E（Chromium + モバイル WebKit）を実行する。ビルド・E2E の両方が成功したときだけ、`production` 環境の承認を経てデプロイに進む。リリースでは Vitest は再実行しない。
- E2E のトレース: `e2e` ジョブの失敗時のみ artifact `playwright-results`（7 日）、リリースの E2E 失敗時は `release-playwright-results`（3 日）に `test-results/` と `playwright-report/` を保存する。
- Playwright のバージョンをキーに `~/.cache/ms-playwright` をキャッシュする（PR の `e2e` ジョブ）。

### 失敗時のトレースの見方

1. Actions の実行結果から artifact（`playwright-results` または `release-playwright-results`）をダウンロードして展開する。
2. 失敗したテストのトレースを開く。

   ```bash
   pnpm exec playwright show-trace test-results/<テスト名>/trace.zip
   ```

ローカルで失敗した場合も、同じ `test-results/` にトレースとスクリーンショットが残る。
