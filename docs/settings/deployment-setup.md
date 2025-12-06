# 🚀 Cloudflare Workers + D1 デプロイ設定ガイド

このガイドに従って、Snow School SchedulerをPure Cloudflare Workers環境にGitHub Actionsを使用してデプロイします。

## 📋 前提条件

- [x] GitHub リポジトリが設定済み
- [x] Cloudflare アカウントを持っている
- [x] Node.js 22.x がローカルにインストール済み
- [x] npm依存関係がインストール済み

## 🔧 セットアップ手順

### 1. Cloudflare API トークン取得

1. [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) にアクセス
2. **「Create Token」** をクリック
3. **「Custom token」** を選択
4. 以下の権限を設定：

   ```
   Account - Cloudflare Workers Script:Edit
   Account - Cloudflare D1:Edit
   Zone - Zone Settings:Read (ドメイン使用時)
   ```

   **権限が見つからない場合の代替設定：**

   ```
   Account - Cloudflare Workers:Edit
   Account - Cloudflare D1:Edit
   ```

   または、より広範囲な権限：

   ```
   Zone - All Zones:Edit
   Account - All Accounts:Edit
   ```

5. **Account Resources**: 「Include - All accounts」を選択
6. **Zone Resources**: 「Include - All zones」を選択（ドメイン使用時）
7. **IP Address Filtering**: 必要に応じて制限（推奨：制限なし）
8. **TTL**: デフォルト（推奨）またはカスタム期限設定
9. トークンを生成し、**安全に保存**（再表示不可）

### 2. Cloudflare Account ID 取得

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にアクセス
2. 右サイドバーの **Account ID** をコピー

### 3. D1データベース作成

ローカル環境でwranglerを使用してD1データベースを作成：

```bash
# Cloudflareにログイン
npm run wrangler:login

# D1データベース作成
npm run cf:d1:create
```

コマンド実行後、出力された **database_id** をコピーしてください。

### 4. wrangler.toml の設定更新

`wrangler.toml` ファイルの `database_id` を実際の値に変更：

```toml
[[d1_databases]]
binding = "DB"
database_name = "fuyugyo"
database_id = "ここに実際のdatabase_idを入力"
```

`[vars]` セクションの `NEXTAUTH_URL` も本番ドメインに合わせて更新してください（Wrangler から Workers へ自動反映されます）。

### 5. GitHub Secrets 設定

GitHubリポジトリの **Settings > Secrets and variables > Actions** で以下のSecretsを設定：

#### 必須設定（Repository secrets）

| Secret名                | 値                         | 説明                           |
| ----------------------- | -------------------------- | ------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | 手順1で取得したAPIトークン | Cloudflare API認証             |
| `CLOUDFLARE_ACCOUNT_ID` | 手順2で取得したAccount ID  | Cloudflareアカウント識別       |
| `JWT_SECRET`            | 64文字以上のランダム文字列 | JWT署名用秘密鍵                |
| `LINE_CHANNEL_SECRET`   | LINE Developersから取得    | LINE認証チャンネルシークレット |

#### JWT_SECRET の生成方法

```bash
# Node.jsで64文字のランダム文字列を生成
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> ℹ️ Prisma CLI は GitHub Actions 内で `PRISMA_DUMMY_DATABASE_URL`（ダミーSQLiteパス）を使用します。本番の D1 接続は Cloudflare バインディングによって解決されるため、Secrets に実データベースURLを登録する必要はありません。

### 6. GitHub Repository Variables 設定

GitHubリポジトリの **Settings > Secrets and variables > Actions > Variables** で以下の変数を設定：

| Variable名        | 値                      | 説明                 |
| ----------------- | ----------------------- | -------------------- |
| `LINE_CHANNEL_ID` | LINE Developersから取得 | LINE認証チャンネルID |

### 7. LINE認証設定

[LINE Developers Console](https://developers.line.biz/console/) で：

1. 既存のチャンネルの設定を開く
2. **Callback URL** に追加：
   ```
   https://fuyugyo.YOUR_SUBDOMAIN.workers.dev/api/auth/line/callback
   ```

**注意**: デプロイ後に実際のWorkers URLが確定するため、初回デプロイ後にCallbackURLを更新してください。

### 8. Prismaマイグレーション準備

D1用のマイグレーションファイルが必要です。以下のコマンドでローカルでマイグレーションを生成：

```bash
# Prismaクライアント生成
npm run db:generate

# 必要に応じてスキーマをD1用に調整
npm run db:push
```

## 🚀 デプロイ実行

### 自動デプロイ（推奨）

1. `main` ブランチにコードをプッシュ
2. GitHub Actionsが自動実行される
3. デプロイ完了を確認

### 手動デプロイ

**注意**: 本プロジェクトは完全自動化されており、手動デプロイは推奨されません。

緊急時には以下のwranglerコマンドを直接使用：

```bash
# 緊急時のみ：ビルド後にwrangler直接実行
npm run build
npx wrangler deploy
npx wrangler d1 migrations apply fuyugyo --env=production
```

## 🔍 デプロイ確認

### Workers URL取得

デプロイ後、以下のコマンドでWorkers URLを確認：

```bash
wrangler whoami
wrangler list
```

### ヘルスチェック

デプロイ後、以下のURLでアプリケーションが正常に動作していることを確認：

```bash
curl https://fuyugyo.YOUR_SUBDOMAIN.workers.dev/api/health
```

期待されるレスポンス：

```json
{
  "status": "ok",
  "timestamp": "2024-09-16T...",
  "database": "connected"
}
```

### アプリケーション動作確認

1. **ログインページ**: https://fuyugyo.YOUR_SUBDOMAIN.workers.dev/login
2. **公開シフト**: https://fuyugyo.YOUR_SUBDOMAIN.workers.dev/shifts
3. **管理画面**: https://fuyugyo.YOUR_SUBDOMAIN.workers.dev/instructors （認証後）

## 🛠️ トラブルシューティング

### よくあるエラー

#### ❌ "Database not found" エラー

- `wrangler.toml` の `database_id` が正しく設定されているか確認
- D1データベースが作成されているか確認

#### ❌ "Unauthorized" エラー

- `CLOUDFLARE_API_TOKEN` が正しく設定されているか確認
- APIトークンに以下の権限があるか確認：
  - `Cloudflare Workers Script:Edit` または `Cloudflare Workers:Edit`
  - `Cloudflare D1:Edit`
- トークンのAccount ResourcesとZone Resourcesが正しく設定されているか確認

#### ❌ LINE認証エラー

- `LINE_CHANNEL_ID` と `LINE_CHANNEL_SECRET` が正しく設定されているか確認
- Callback URLが実際のWorkers URLと一致しているか確認

#### ❌ ビルドエラー

- 全ての環境変数が設定されているか確認
- `npm run typecheck` と `npm run lint` がローカルで成功するか確認

### ログ確認方法

```bash
# Cloudflare Workersのログ確認
wrangler tail

# D1データベースの状態確認
wrangler d1 info fuyugyo
```

## 📈 本番運用のベストプラクティス

1. **監視**: Cloudflare Analytics でトラフィックを監視
2. **バックアップ**: 定期的な D1 データエクスポート（まだ未実装）
3. **セキュリティ**: 定期的な依存関係の更新
4. **パフォーマンス**: Web Vitals の継続的な監視

## 🔄 CI/CD ワークフロー

### 自動実行される処理

1. **コード品質チェック**
   - TypeScript型チェック
   - ESLintによる静的解析
   - Prettierによる整形チェック
   - Jestによる単体テスト

2. **ビルドとデプロイ**
   - Next.js アプリケーションビルド
   - Pure Cloudflare Workers へデプロイ
   - D1 データベースマイグレーション適用

3. **デプロイ後チェック**
   - ヘルスチェックAPI確認
   - 基本機能の動作確認

### ブランチ戦略

- **`main`**: 本番環境自動デプロイ
- **feature branches**: 開発用（自動デプロイなし）
- **Pull Request**: 品質チェックのみ実行

## ⚙️ Pure Workers特有の注意事項

### Next.js App Router対応

- `compatibility_flags = ["nodejs_compat"]` が設定済み
- Server Componentsは完全サポート
- API RoutesはWorkers Request/Response APIで動作

### パフォーマンス最適化

- Cold Start時間: 約10-50ms
- メモリ制限: 128MB
- 実行時間制限: 30秒（CPU時間）

### ファイルシステム制限

- ローカルファイル読み込み不可
- 静的アセットはWorkers KVまたはR2使用推奨

これでPure Cloudflare Workers環境での自動デプロイが完了します！
