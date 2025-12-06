# デプロイメント手順書 - 認証システム対応

## 1. 概要

LINE認証機能を追加したFuyugyō - 運営管理システムをCloudflare Workers + D1環境にデプロイするための手順書。

### 1.1 デプロイメント環境

- **開発環境**: Next.js Development Server + SQLite
- **本番環境**: Cloudflare Workers + D1 Database
- **認証**: LINE Login API
- **セッション**: JWT (HttpOnly Cookie)

## 2. 事前準備

### 2.1 必要なアカウント・サービス

- [ ] Cloudflareアカウント（Workers・D1利用可能）
- [ ] LINE Developersアカウント
- [ ] GitHubアカウント（CI/CD用）
- [ ] Node.js >=22.0.0

### 2.2 開発ツール

```bash
# 必要なCLIツールのインストール
npm install -g wrangler
npm install -g prisma
```

## 3. LINE Developers設定

### 3.1 LINE Login Channel作成

1. **LINE Developers Console**にアクセス
   - https://developers.line.biz/console/
2. **新規プロバイダー作成**

   ```
   プロバイダー名: [スクール名] Shift System
   ```

3. **LINE Login Channel作成**
   ```
   チャネル名: [スクール名] Shift Login
   チャネル説明: スタッフ向けシフト管理システムログイン
   アプリタイプ: ウェブアプリ
   ```

### 3.2 Channel設定

```bash
# 開発環境
Callback URL: http://localhost:3000/api/auth/line/callback

# 本番環境
Callback URL: https://your-app.pages.dev/api/auth/line/callback
```

**必要な権限**:

- `profile` - ユーザープロフィール取得
- `openid` - OpenID Connect

### 3.3 認証情報取得

```bash
# 以下の情報を取得・保存
Channel ID: 1234567890
Channel Secret: abcdef123456789...
```

## 4. Cloudflare環境セットアップ

### 4.1 Cloudflareプロジェクト作成

```bash
# Wranglerログイン
wrangler login

# プロジェクト初期化（既存プロジェクトに追加）
cd fuyugyo
npx create cloudflare@latest --framework=next --existing
```

### 4.2 D1データベース作成

```bash
# D1データベース作成
wrangler d1 create fuyugyo

# データベースIDを取得（出力例）
# ✅ Successfully created DB 'fuyugyo' in region APAC
# Created your new D1 database.
#
# [[d1_databases]]
# binding = "DB"
# database_name = "fuyugyo"
# database_id = "12345678-1234-1234-1234-123456789abc"
```

### 4.3 wrangler.toml設定

```toml
# wrangler.toml
name = "fuyugyo"
main = "src/index.js"
compatibility_date = "2024-08-29"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "fuyugyo"
database_id = "12345678-1234-1234-1234-123456789abc"

[vars]
NODE_ENV = "production"
NEXTAUTH_URL = "https://your-app.pages.dev"

# Secrets (wrangler secret put で設定)
# LINE_CHANNEL_ID
# LINE_CHANNEL_SECRET
# JWT_SECRET
```

### 4.4 環境変数・Secrets設定

```bash
# 本番環境のSecrets設定
wrangler secret put LINE_CHANNEL_ID
# Enter the secret text you'd like assigned to the variable: 1234567890

wrangler secret put LINE_CHANNEL_SECRET
# Enter the secret text you'd like assigned to the variable: abcdef123456789...

wrangler secret put JWT_SECRET
# Enter the secret text you'd like assigned to the variable: your-super-secure-jwt-secret-256bit
```

## 5. データベース移行

### 5.1 Prismaスキーマ更新

```prisma
// prisma/schema.prisma に追加

/// ユーザー認証・権限管理テーブル
model User {
  id           String   @id @default(cuid())
  lineUserId   String   @unique @map("line_user_id")
  displayName  String   @map("display_name")
  role         UserRole @default(MEMBER)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  createdInvitations InvitationToken[] @relation("CreatedBy")

  @@index([lineUserId], map: "idx_users_line_user_id")
  @@index([role], map: "idx_users_role")
  @@index([isActive], map: "idx_users_active")
  @@index([role, isActive], map: "idx_users_role_active")
  @@map("users")
}

enum UserRole {
  ADMIN
  MANAGER
  MEMBER
}

/// 招待URL管理テーブル
model InvitationToken {
  token     String   @id
  expiresAt DateTime @map("expires_at")
  isActive  Boolean  @default(true) @map("is_active")
  createdBy String   @map("created_by")
  maxUses   Int?     @map("max_uses")
  usedCount Int      @default(0) @map("used_count")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  creator User @relation("CreatedBy", fields: [createdBy], references: [id])

  @@index([expiresAt], map: "idx_invitation_tokens_expires_at")
  @@index([isActive], map: "idx_invitation_tokens_active")
  @@index([createdBy], map: "idx_invitation_tokens_created_by")
  @@index([isActive, expiresAt], map: "idx_invitation_tokens_active_expires")
  @@map("invitation_tokens")
}
```

### 5.2 マイグレーション生成・適用

```bash
# 開発環境でマイグレーション生成
npm run db:generate
npx prisma migrate dev --name add_authentication_system

# 本番環境（D1）にマイグレーション適用
wrangler d1 execute fuyugyo --file=./prisma/migrations/[timestamp]_add_authentication_system/migration.sql
```

### 5.3 初期データ投入

```bash
# ファーストアドミン作成スクリプト実行
wrangler d1 execute fuyugyo --command="
INSERT INTO users (id, line_user_id, display_name, role, is_active, created_at, updated_at)
VALUES ('admin-001', 'YOUR_LINE_USER_ID', '初期管理者', 'ADMIN', 1, datetime('now'), datetime('now'))
"
```

## 6. アプリケーションコード修正

### 6.1 環境変数設定

```typescript
// lib/env.ts
export const env = {
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID!,
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET!,
  JWT_SECRET: process.env.JWT_SECRET!,
  DATABASE_URL: process.env.DATABASE_URL!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
};
```

### 6.2 Prismaクライアント設定

```typescript
// lib/db.ts (Cloudflare対応版)
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'info'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
```

### 6.3 Next.js設定調整

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'your-app.pages.dev'],
    },
  },
  // Cloudflare Workers対応
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

## 7. ビルド・デプロイ

### 7.1 本番ビルド

```bash
# 依存関係インストール
npm ci

# TypeScript型チェック
npm run typecheck

# Lintチェック
npm run lint

# テスト実行
npm test

# 本番ビルド
npm run build
```

### 7.2 Cloudflareへのデプロイ

```bash
# 初回デプロイ
wrangler deploy

# デプロイ成功例
# ✅ Successfully deployed to https://fuyugyo.your-subdomain.workers.dev
```

### 7.3 カスタムドメイン設定（オプション）

```bash
# カスタムドメイン追加
wrangler domains add your-school-shifts.com

# DNS設定（Cloudflare DNS）
# A record: your-school-shifts.com → [Workers IP]
# AAAA record: your-school-shifts.com → [Workers IPv6]
```

## 8. 動作確認

### 8.1 基本動作テスト

```bash
# ヘルスチェック
curl https://your-app.pages.dev/api/health

# レスポンス例
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-08-29T10:00:00.000Z",
    "database": "connected"
  }
}
```

### 8.2 認証フロー確認

1. **招待URL生成テスト**

   ```bash
   # 管理者として初回ログイン
   # 招待URL生成機能確認
   ```

2. **LINE認証テスト**

   ```
   https://your-app.pages.dev/auth/invite/[TOKEN]
   → LINE認証画面
   → 認証成功後シフト表画面
   ```

3. **権限チェック確認**
   ```
   member権限: /shifts アクセス可能、/admin アクセス不可
   admin権限: 全ページアクセス可能
   ```

## 9. 監視・運用

### 9.1 Cloudflareダッシュボード確認

- **Analytics**: リクエスト数、レスポンス時間
- **D1 Console**: データベース使用量、クエリ実行
- **Workers Logs**: エラーログ、アクセスログ

### 9.2 アラート設定

```bash
# Cloudflareアラート設定（Web UIから）
- エラー率 > 5%
- レスポンス時間 > 3秒
- D1使用量 > 80%
```

### 9.3 定期メンテナンス

```bash
# 期限切れトークンクリーンアップ（Cron Triggers使用）
# wrangler.toml に追加
[[triggers]]
crons = ["0 2 * * *"]  # 毎日午前2時実行
```

## 10. トラブルシューティング

### 10.1 よくある問題

**問題**: D1データベース接続エラー

```bash
# 解決方法
wrangler d1 info fuyugyo
# データベースIDを wrangler.toml で確認
```

**問題**: LINE認証失敗

```bash
# 解決方法
# 1. Callback URLが正確か確認
# 2. Channel IDが正しく設定されているか確認
wrangler secret list
```

**問題**: JWT検証エラー

```bash
# 解決方法
# JWT_SECRETが256bit以上か確認
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 10.2 ログ確認方法

```bash
# リアルタイムログ監視
wrangler tail

# 特定期間のログ取得
wrangler tail --since=2024-08-29T10:00:00Z
```

### 10.3 ロールバック手順

```bash
# 前バージョンにロールバック
wrangler rollback [DEPLOYMENT_ID]

# マイグレーションロールバック（緊急時）
wrangler d1 execute fuyugyo --command="
DROP TABLE invitation_tokens;
DROP TABLE users;
"
```

## 11. CI/CD設定

### 11.1 GitHub Actions設定

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Deploy to Cloudflare Workers
        if: github.ref == 'refs/heads/main'
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

### 11.2 Environment Secrets設定

```bash
# GitHubリポジトリのSecretsに以下を設定
CLOUDFLARE_API_TOKEN=your_api_token
```

## 12. パフォーマンス最適化

### 12.1 Cloudflare設定

```toml
# wrangler.toml - パフォーマンス設定
[build]
command = "npm run build"

[env.production]
vars = { NODE_ENV = "production" }

# キャッシュ設定
[[rules]]
type = "cache"
src = "*.js"
cache_control = "public, max-age=86400"
```

### 12.2 データベース最適化

```sql
-- D1パフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(is_active, role);
CREATE INDEX IF NOT EXISTS idx_tokens_active_expires ON invitation_tokens(is_active, expires_at);
```

## 13. セキュリティ強化

### 13.1 CSP設定

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
  );

  return response;
}
```

### 13.2 Rate Limiting

```typescript
// Cloudflare KVを使ったレート制限
const rateLimitKey = `rate_limit:${clientIP}`;
const current = await env.RATE_LIMIT.get(rateLimitKey);

if (current && parseInt(current) > 10) {
  return new Response('Too Many Requests', { status: 429 });
}

await env.RATE_LIMIT.put(rateLimitKey, '1', { expirationTtl: 60 });
```

---

## 付録

### A. チェックリスト

#### デプロイ前チェックリスト

- [ ] LINE Developers設定完了
- [ ] Cloudflare D1データベース作成
- [ ] 環境変数・Secrets設定
- [ ] マイグレーション実行
- [ ] 初期管理者作成
- [ ] テスト実行・型チェック・Lint通過

#### デプロイ後チェックリスト

- [ ] ヘルスチェック確認
- [ ] LINE認証フロー動作確認
- [ ] 権限管理機能確認
- [ ] 招待URL生成・使用確認
- [ ] 既存シフト機能動作確認

### B. 緊急時連絡先

```
管理者: your-admin@email.com
LINE Developers: https://developers.line.biz/console/
Cloudflare Support: https://dash.cloudflare.com/
```

### C. 参考リンク

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [LINE Login API Documentation](https://developers.line.biz/en/docs/line-login/)
- [Next.js on Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
