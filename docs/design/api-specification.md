# API仕様書 - 認証システム

## 1. 概要

Fuyugyō - 運営管理システムに追加される認証関連APIの仕様書。
LINE OAuth2認証、JWT認証、招待システムのエンドポイントを定義する。

### 1.1 APIの特徴

- **RESTful設計**: 標準的なHTTPメソッドとステータスコード
- **統一レスポンス形式**: 成功・エラー共通フォーマット
- **JWT認証**: ステートレストークンベース認証
- **型安全**: TypeScript型定義とZodバリデーション

## 2. 共通仕様

### 2.1 ベースURL

```
開発環境: http://localhost:3000/api
本番環境: https://your-app.pages.dev/api
```

### 2.2 認証ヘッダー

```http
Cookie: auth-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.3 統一レスポンス形式

```typescript
// 成功レスポンス
interface SuccessResponse<T> {
  success: true;
  data: T;
}

// エラーレスポンス
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// 汎用APIレスポンス型
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
```

### 2.4 共通HTTPステータスコード

| ステータス | 意味                  | 用途                 |
| ---------- | --------------------- | -------------------- |
| 200        | OK                    | 成功                 |
| 201        | Created               | リソース作成成功     |
| 400        | Bad Request           | バリデーションエラー |
| 401        | Unauthorized          | 認証が必要           |
| 403        | Forbidden             | 権限不足             |
| 404        | Not Found             | リソースが存在しない |
| 500        | Internal Server Error | サーバー内部エラー   |

## 3. 認証関連API

### 3.1 LINE OAuth認証開始

**エンドポイント**: `GET /api/auth/line/login`

LINE認証画面へのリダイレクトURL生成

#### リクエスト

```http
GET /api/auth/line/login?redirect_uri=/shifts HTTP/1.1
```

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| redirect_uri | string | No | 認証後のリダイレクト先（デフォルト: /shifts） |

#### レスポンス

```http
HTTP/1.1 302 Found
Location: https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=...
```

### 3.2 LINE OAuth コールバック処理

**エンドポイント**: `GET /api/auth/line/callback`

LINE認証後のコールバック処理、JWT発行

#### リクエスト

```http
GET /api/auth/line/callback?code=ABC123&state=xyz789 HTTP/1.1
```

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| code | string | Yes | LINE認証コード |
| state | string | Yes | CSRF対策用state |

#### レスポンス（成功）

```http
HTTP/1.1 302 Found
Set-Cookie: auth-token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=172800
Location: /shifts
```

#### レスポンス（エラー）

```http
HTTP/1.1 302 Found
Location: /auth/error?message=authentication_failed
```

### 3.3 ログアウト

**エンドポイント**: `POST /api/auth/logout`

JWT Cookieの削除

#### リクエスト

```http
POST /api/auth/logout HTTP/1.1
Cookie: auth-token=eyJ...
```

#### レスポンス

```http
HTTP/1.1 200 OK
Set-Cookie: auth-token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0

{
  "success": true,
  "data": {
    "message": "ログアウトしました"
  }
}
```

### 3.4 ユーザー情報取得

**エンドポイント**: `GET /api/auth/me`

現在ログイン中のユーザー情報取得

#### リクエスト

```http
GET /api/auth/me HTTP/1.1
Cookie: auth-token=eyJ...
```

#### レスポンス（成功）

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "line_user_id": "U123456789abcdef",
    "display_name": "山田太郎",
    "role": "member",
    "is_active": true,
    "created_at": "2024-08-29T10:00:00Z"
  }
}
```

#### レスポンス（未認証）

```http
HTTP/1.1 401 Unauthorized

{
  "success": false,
  "error": "認証が必要です",
  "code": "AUTHENTICATION_REQUIRED"
}
```

## 4. 招待システムAPI

### 4.1 招待URL生成

**エンドポイント**: `POST /api/auth/invitations`

**権限**: admin

新しい招待URLを生成する

#### リクエスト

```json
{
  "expires_hours": 168,
  "max_uses": null
}
```

**Body Parameters**:
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| expires_hours | number | No | 168 | 有効期限（時間、最大720） |
| max_uses | number \| null | No | null | 最大使用回数（null=無制限） |

#### レスポンス（成功）

```json
{
  "success": true,
  "data": {
    "token": "invitation-uuid",
    "url": "https://your-app.pages.dev/auth/invite/invitation-uuid",
    "expires_at": "2024-09-05T10:00:00Z",
    "max_uses": null,
    "created_at": "2024-08-29T10:00:00Z"
  }
}
```

#### レスポンス（権限エラー）

```http
HTTP/1.1 403 Forbidden

{
  "success": false,
  "error": "管理者権限が必要です",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### 4.2 招待URL一覧取得

**エンドポイント**: `GET /api/auth/invitations`

**権限**: admin

現在の招待URL一覧を取得

#### リクエスト

```http
GET /api/auth/invitations?active_only=true HTTP/1.1
Cookie: auth-token=eyJ...
```

**Query Parameters**:
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| active_only | boolean | No | false | アクティブな招待のみ取得 |

#### レスポンス

```json
{
  "success": true,
  "data": [
    {
      "token": "invitation-uuid",
      "expires_at": "2024-09-05T10:00:00Z",
      "is_active": true,
      "max_uses": null,
      "used_count": 3,
      "created_by": "admin-uuid",
      "created_at": "2024-08-29T10:00:00Z"
    }
  ]
}
```

### 4.3 招待URL無効化

**エンドポイント**: `DELETE /api/auth/invitations/[token]`

**権限**: admin

指定した招待URLを無効化

#### リクエスト

```http
DELETE /api/auth/invitations/invitation-uuid HTTP/1.1
Cookie: auth-token=eyJ...
```

#### レスポンス（成功）

```json
{
  "success": true,
  "data": {
    "message": "招待URLを無効化しました",
    "token": "invitation-uuid"
  }
}
```

#### レスポンス（見つからない）

```http
HTTP/1.1 404 Not Found

{
  "success": false,
  "error": "招待URLが見つかりません",
  "code": "INVITATION_NOT_FOUND"
}
```

### 4.4 招待URL検証

**エンドポイント**: `GET /api/auth/invitations/[token]/verify`

招待URLの有効性を検証

#### リクエスト

```http
GET /api/auth/invitations/invitation-uuid/verify HTTP/1.1
```

#### レスポンス（有効）

```json
{
  "success": true,
  "data": {
    "valid": true,
    "expires_at": "2024-09-05T10:00:00Z",
    "remaining_uses": null
  }
}
```

#### レスポンス（無効）

```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "expired"
  }
}
```

## 5. ユーザー管理API

### 5.1 ユーザー一覧取得

**エンドポイント**: `GET /api/auth/users`

**権限**: admin

システム内のユーザー一覧を取得

#### リクエスト

```http
GET /api/auth/users?role=member&active_only=true HTTP/1.1
Cookie: auth-token=eyJ...
```

**Query Parameters**:
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| role | string | No | 権限でフィルタ（admin/manager/member） |
| active_only | boolean | No | アクティブユーザーのみ |

#### レスポンス

```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid",
      "line_user_id": "U123456789abcdef",
      "display_name": "山田太郎",
      "role": "member",
      "is_active": true,
      "created_at": "2024-08-29T10:00:00Z",
      "updated_at": "2024-08-29T10:00:00Z"
    }
  ]
}
```

### 5.2 ユーザー詳細取得

**エンドポイント**: `GET /api/auth/users/[id]`

**権限**: admin

特定ユーザーの詳細情報を取得

#### リクエスト

```http
GET /api/auth/users/user-uuid HTTP/1.1
Cookie: auth-token=eyJ...
```

#### レスポンス

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "line_user_id": "U123456789abcdef",
    "display_name": "山田太郎",
    "role": "member",
    "is_active": true,
    "created_at": "2024-08-29T10:00:00Z",
    "updated_at": "2024-08-29T10:00:00Z"
  }
}
```

### 5.3 ユーザー権限更新

**エンドポイント**: `PUT /api/auth/users/[id]`

**権限**: admin

ユーザーの権限・状態を更新

#### リクエスト

```json
{
  "role": "manager",
  "is_active": true
}
```

**Body Parameters**:
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| role | string | No | 新しい権限（admin/manager/member） |
| is_active | boolean | No | アクティブ状態 |

#### レスポンス（成功）

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "role": "manager",
    "is_active": true,
    "updated_at": "2024-08-29T12:00:00Z"
  }
}
```

### 5.4 ユーザー削除

**エンドポイント**: `DELETE /api/auth/users/[id]`

**権限**: admin

ユーザーを論理削除（is_active = false）

#### リクエスト

```http
DELETE /api/auth/users/user-uuid HTTP/1.1
Cookie: auth-token=eyJ...
```

#### レスポンス

```json
{
  "success": true,
  "data": {
    "message": "ユーザーを無効化しました",
    "user_id": "user-uuid"
  }
}
```

## 6. エラーコード定義

### 6.1 認証エラー

| コード                   | HTTPステータス | 説明                   |
| ------------------------ | -------------- | ---------------------- |
| AUTHENTICATION_REQUIRED  | 401            | 認証が必要             |
| INVALID_TOKEN            | 401            | 無効なJWTトークン      |
| TOKEN_EXPIRED            | 401            | トークンの有効期限切れ |
| INSUFFICIENT_PERMISSIONS | 403            | 権限不足               |

### 6.2 招待システムエラー

| コード                    | HTTPステータス | 説明                     |
| ------------------------- | -------------- | ------------------------ |
| INVITATION_NOT_FOUND      | 404            | 招待URLが存在しない      |
| INVITATION_EXPIRED        | 400            | 招待URLの有効期限切れ    |
| INVITATION_INACTIVE       | 400            | 招待URLが無効化済み      |
| INVITATION_LIMIT_EXCEEDED | 400            | 使用回数上限に達している |

### 6.3 LINE認証エラー

| コード              | HTTPステータス | 説明                       |
| ------------------- | -------------- | -------------------------- |
| LINE_AUTH_FAILED    | 401            | LINE認証に失敗             |
| LINE_AUTH_CANCELLED | 400            | ユーザーが認証をキャンセル |
| INVALID_AUTH_CODE   | 400            | 無効な認証コード           |
| STATE_MISMATCH      | 400            | stateパラメータの不一致    |

### 6.4 バリデーションエラー

| コード                 | HTTPステータス | 説明                         |
| ---------------------- | -------------- | ---------------------------- |
| VALIDATION_ERROR       | 400            | 入力値のバリデーションエラー |
| MISSING_REQUIRED_FIELD | 400            | 必須フィールドが不足         |
| INVALID_FIELD_FORMAT   | 400            | フィールド形式が不正         |

## 7. レート制限

### 7.1 制限仕様

| エンドポイント        | 制限 | 期間  |
| --------------------- | ---- | ----- |
| /api/auth/line/login  | 10回 | 1分間 |
| /api/auth/invitations | 5回  | 1分間 |
| /api/auth/users       | 30回 | 1分間 |

### 7.2 制限超過レスポンス

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "success": false,
  "error": "リクエストが多すぎます。しばらく待ってから再試行してください",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

## 8. セキュリティヘッダー

### 8.1 推奨ヘッダー

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## 9. バリデーションスキーマ

### 9.1 招待URL作成

```typescript
const createInvitationSchema = z.object({
  expires_hours: z.number().min(1).max(720).optional().default(168),
  max_uses: z.number().positive().nullable().optional().default(null),
});
```

### 9.2 ユーザー更新

```typescript
const updateUserSchema = z
  .object({
    role: z.enum(['admin', 'manager', 'member']).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '少なくとも1つのフィールドが必要です',
  });
```

## 10. 開発・テスト用エンドポイント

### 10.1 テストユーザー作成（開発環境のみ）

**エンドポイント**: `POST /api/auth/dev/create-user`

**環境**: development のみ

#### リクエスト

```json
{
  "line_user_id": "U_test_user_123",
  "display_name": "テストユーザー",
  "role": "member"
}
```

#### レスポンス

```json
{
  "success": true,
  "data": {
    "id": "test-user-uuid",
    "line_user_id": "U_test_user_123",
    "display_name": "テストユーザー",
    "role": "member"
  }
}
```

### 10.2 ファーストアドミン作成

**エンドポイント**: `POST /api/auth/setup/first-admin`

**使用制限**: 管理者が存在しない場合のみ

#### リクエスト

```json
{
  "secret": "SUPER_SECRET_SETUP_KEY",
  "line_user_id": "U_admin_123456"
}
```

#### レスポンス

```json
{
  "success": true,
  "data": {
    "admin_id": "admin-uuid",
    "message": "初期管理者を作成しました"
  }
}
```

---

## 付録

### A. TypeScript型定義

```typescript
// User types
interface User {
  id: string;
  line_user_id: string;
  display_name: string;
  role: 'admin' | 'manager' | 'member';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Invitation types
interface Invitation {
  token: string;
  expires_at: string;
  is_active: boolean;
  created_by: string;
  max_uses: number | null;
  used_count: number;
  created_at: string;
}

// JWT Payload
interface JWTPayload {
  sub: string;
  line_user_id: string;
  role: 'admin' | 'manager' | 'member';
  name: string;
  iat: number;
  exp: number;
}
```

### B. cURLサンプル

```bash
# ユーザー一覧取得
curl -X GET "https://your-app.pages.dev/api/auth/users" \
  -H "Cookie: auth-token=eyJ..." \
  -H "Content-Type: application/json"

# 招待URL生成
curl -X POST "https://your-app.pages.dev/api/auth/invitations" \
  -H "Cookie: auth-token=eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"expires_hours": 168}'

# ユーザー権限更新
curl -X PUT "https://your-app.pages.dev/api/auth/users/user-uuid" \
  -H "Cookie: auth-token=eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}'
```
