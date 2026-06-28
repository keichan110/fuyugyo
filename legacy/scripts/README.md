# Scripts

このディレクトリには、プロジェクトで使用する各種スクリプトが含まれています。

## prepare-d1-migrations.js

Prisma のマイグレーションを Cloudflare D1 用のフラット構造に変換するスクリプトです。

### 概要

Prisma はサブディレクトリ構造（`timestamp_name/migration.sql`）でマイグレーションを管理しますが、Wrangler D1 はフラットな構造を期待します。このスクリプトは、Prisma のマイグレーションを D1 用に変換します。

### 使用方法

**⚠️ 重要: このスクリプトは GitHub Actions でのみ実行されます。ローカルから直接 D1 を操作しないでください。**

#### 本番環境（CI/CD）

main ブランチへのマージ時、GitHub Actions が自動的に以下を実行します：

1. `node scripts/prepare-d1-migrations.js` - マイグレーションをフラット化
2. `wrangler d1 migrations apply fuyugyo --remote` - 本番 D1 にマイグレーションを適用

#### ローカル開発

ローカル開発では D1 を使用せず、Prisma の開発用 SQLite データベース (`prisma/dev.db`) を使用します：

```bash
# スキーマ変更を反映
npm run db:push

# Prisma Studio でデータ確認
npm run db:studio
```

### 動作の仕組み

1. **既存のフラットディレクトリをクリア**
   - `prisma/migrations_d1/` が存在する場合、削除して再作成

2. **マイグレーションディレクトリをスキャン**
   - `prisma/migrations/` から `YYYYMMDDHHMMSS_*` パターンのディレクトリを検出

3. **マイグレーションファイルをコピー**
   - 各 `migration.sql` を `prisma/migrations_d1/YYYYMMDDHHMMSS_name.sql` にコピー

4. **結果の報告**
   - コピーされたマイグレーション数を表示

### 変換例

**変換前（Prisma 構造）:**
```
prisma/migrations/
  20250920065544_add_users_and_invitations/
    migration.sql
  20251027143627_add_instructor_id_to_users/
    migration.sql
```

**変換後（D1 構造）:**
```
prisma/migrations_d1/
  20250920065544_add_users_and_invitations.sql
  20251027143627_add_instructor_id_to_users.sql
```

### マイグレーション履歴管理

マイグレーション履歴は Wrangler D1 が自動的に `d1_migrations` テーブルで管理します。カスタムの履歴管理は不要です。

### トラブルシューティング

#### マイグレーションディレクトリが見つからない

```bash
❌ Error: Migrations directory not found: prisma/migrations
```

**解決方法**: プロジェクトルートからスクリプトを実行していることを確認してください。

#### マイグレーションが適用されない

**確認事項**:
1. `prisma/migrations_d1/` ディレクトリが生成されているか確認（GitHub Actions のログで確認）
2. GitHub Actions の deploy ワークフローのログを確認
3. マイグレーションファイルが main ブランチに正しくマージされているか確認

### セキュリティと保守性

- ✅ **公式機能を使用**: Wrangler D1 のネイティブマイグレーション機能
- ✅ **トランザクション管理**: Wrangler が自動的に処理
- ✅ **冪等性**: 同じマイグレーションの重複実行を防止
- ✅ **保守性**: Cloudflare が保守する信頼性の高いコード

## その他のスクリプト

### get-wrangler-config.js

`wrangler.toml`から設定値を取得するユーティリティスクリプトです。

**使用例**:

```bash
node scripts/get-wrangler-config.js 'vars.NEXTAUTH_URL'
```

### coverage-badge.js

テストカバレッジバッジを生成するスクリプトです。

**使用方法**:

```bash
npm run test:coverage:badge
```
