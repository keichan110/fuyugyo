# Rate Limiting は認証系エンドポイントのみに CF ネイティブバインディングで適用する

## Status

accepted

## Context

現行のインメモリ Map ベース Rate Limit は CF Workers の isolate 間で状態を共有できず機能しない。移行計画では KV ベースを提案していたが、KV は毎リクエストで read+write が発生し課金・レイテンシ・結果整合性の問題がある。

## Decision

- **適用範囲を認証系エンドポイントのみに絞る**: LINE login、LINE callback、招待トークン検証など**未認証でアクセスできる攻撃面**にのみ Rate Limit をかける。
- **認証済みの一般 CRUD API には Rate Limit を適用しない**。JWT 認証で守られており、過剰防御は開発コストとランタイムコストを増やすだけ。必要になれば後付けする。
- 方式は **CF ネイティブ Rate Limiting バインディング**（`wrangler.toml` の rate limit binding）を採用。isolate 横断で正しく動作し、KV のような read 課金がない。

## Consequences

- ブルートフォース対策は攻撃面（未認証）に限定して確保される。
- CF ネイティブ Rate Limit は設定が固定的（キー＋期間＋上限）だが、認証系の用途には十分。
- インメモリ実装（`lib/api/rate-limiting.ts`）は破棄する。
